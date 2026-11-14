import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
app.set('trust proxy', 1);

// ============================================================================
// FASE 8: Caché Inteligente en Memoria (TTL 25 minutos) y Rate Limiting por IP
// ============================================================================
const CACHE_TTL_MS = 25 * 60 * 1000; // 25 minutos (rango 20-30 min)

class TtlMemoryCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();
  constructor(private readonly ttlMs = CACHE_TTL_MS, private readonly maxEntries = 500) {}

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  set(key: string, value: T, customTtlMs?: number): void {
    if (this.store.size >= this.maxEntries) {
      // Evict expired entries first, then oldest
      const now = Date.now();
      for (const [k, v] of this.store.entries()) {
        if (now > v.expiresAt) this.store.delete(k);
      }
      if (this.store.size >= this.maxEntries) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey) this.store.delete(oldestKey);
      }
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (customTtlMs ?? this.ttlMs),
    });
  }
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_GENERATION = 30; // Máximo 30 peticiones/min por IP en rutas de IA/búsqueda
const RATE_LIMIT_MAX_AUXILIARY = 120; // Rutas auxiliares (rutas, clima, geocode, sesiones)
const RATE_LIMIT_MAX_PHOTOS = 240; // Proxy de fotos cacheado para tarjetas y rutas encadenadas

type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'CORS_FORBIDDEN'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'NO_VERIFIED_PLACES'
  | 'NO_VERIFIED_PLACES_IN_RADIUS'
  | 'MAPS_UNAVAILABLE'
  | 'AI_UNAVAILABLE'
  | 'GEMINI_TIMEOUT'
  | 'INTERNAL_ERROR';

function sendStructuredError(
  res: Response,
  status: number,
  params: {
    code: ApiErrorCode;
    message: string;
    retryable: boolean;
    extra?: Record<string, unknown>;
  }
) {
  const requestId =
    (res.locals?.requestId as string) ||
    `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return res.status(status).json({
    code: params.code,
    message: params.message,
    requestId,
    retryable: params.retryable,
    ...(params.extra || {}),
  });
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  return (
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

const ipRateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateBucket(
  bucketName: string,
  clientIp: string,
  maxRequests: number
): { allowed: boolean; remaining: number; resetAt: number; retryAfterSec: number } {
  const key = `${bucketName}:${clientIp}`;
  const now = Date.now();
  let record = ipRateLimits.get(key);
  if (!record || now > record.resetAt) {
    if (ipRateLimits.size > 4000) {
      for (const [k, v] of ipRateLimits.entries()) {
        if (now > v.resetAt) ipRateLimits.delete(k);
      }
    }
    record = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  record.count += 1;
  ipRateLimits.set(key, record);

  const remaining = Math.max(0, maxRequests - record.count);
  const retryAfterSec = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
  return {
    allowed: record.count <= maxRequests,
    remaining,
    resetAt: record.resetAt,
    retryAfterSec,
  };
}

const apiRateLimiter = (req: Request, res: Response, next: () => void) => {
  if (req.method === 'OPTIONS' || req.path === '/health') {
    return next();
  }

  const clientIp = getClientIp(req);
  const isPhotoRoute = req.path === '/place-photo';
  const isStrictGenOrSearchRoute =
    req.path === '/generate' ||
    req.path.startsWith('/gemini/') ||
    req.path === '/group/deck' ||
    req.path === '/places/search' ||
    req.path === '/places';

  const bucket = isPhotoRoute ? 'photos' : isStrictGenOrSearchRoute ? 'gen' : 'aux';
  const maxReqs = isPhotoRoute
    ? RATE_LIMIT_MAX_PHOTOS
    : isStrictGenOrSearchRoute
    ? RATE_LIMIT_MAX_GENERATION
    : RATE_LIMIT_MAX_AUXILIARY;

  const check = checkRateBucket(bucket, clientIp, maxReqs);

  res.setHeader('X-RateLimit-Limit', String(maxReqs));
  res.setHeader('X-RateLimit-Remaining', String(check.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(check.resetAt / 1000)));

  if (!check.allowed) {
    res.setHeader('Retry-After', String(check.retryAfterSec));
    return sendStructuredError(res, 429, {
      code: 'RATE_LIMITED',
      message: `Has alcanzado el límite de ${maxReqs} peticiones por minuto. Espera ${check.retryAfterSec} segundos e inténtalo de nuevo.`,
      retryable: true,
      extra: { retryAfterSeconds: check.retryAfterSec },
    });
  }

  return next();
};

// Política CORS explícita por orígenes autorizados (producción + desarrollo local)
const configuredAllowedOrigins = [
  process.env.CLIENT_ORIGIN,
  process.env.ALLOWED_ORIGIN,
  process.env.CORS_ORIGIN,
]
  .filter(Boolean)
  .join(',')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const TRUSTED_HOST_SUFFIXES = [
  '.run.app',
  '.onrender.com',
  '.railway.app',
  '.vercel.app',
  '.netlify.app',
];

function normalizeHostHeader(req: Request): string {
  const forwardedHost = req.headers['x-forwarded-host'];
  const rawHost = typeof forwardedHost === 'string' ? forwardedHost.split(',')[0].trim() : req.get('host') || '';
  return rawHost.toLowerCase();
}

function isOriginAllowed(origin: string, req?: Request): boolean {
  try {
    const normalizedOrigin = origin.trim().replace(/\/+$/, '');
    const parsed = new URL(normalizedOrigin);
    const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';

    // 1. Always permit true same-origin browser requests (browsers attach Origin on POST even when same-origin)
    if (req) {
      const requestHost = normalizeHostHeader(req);
      if (requestHost && parsed.host.toLowerCase() === requestHost) {
        return true;
      }
    }

    // 2. Always permit configured APP_URL origin or AI Studio preview .run.app subdomains (ais-dev-* / ais-pre-*)
    if (process.env.APP_URL) {
      try {
        const appUrlParsed = new URL(process.env.APP_URL);
        if (parsed.origin === appUrlParsed.origin) return true;
      } catch {
        // Ignore malformed APP_URL
      }
    }
    if (/^ais-(dev|pre)-[a-z0-9-]+\.[a-z0-9-]+\.run\.app$/i.test(parsed.hostname)) {
      return true;
    }

    // 3. Explicit configured allowlist when provided
    if (configuredAllowedOrigins.length > 0) {
      if (configuredAllowedOrigins.includes('*')) return true;
      if (configuredAllowedOrigins.includes(normalizedOrigin)) return true;
      if (process.env.NODE_ENV !== 'production' && isLocalhost) return true;
      if (process.env.NODE_ENV !== 'production' && parsed.hostname.endsWith('.run.app')) return true;
      return false;
    }

    if (isLocalhost) return true;
    return TRUSTED_HOST_SUFFIXES.some((suffix) => parsed.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

app.use((req: Request, res: Response, next) => {
  const reqIdHeader = req.headers['x-request-id'];
  const requestId =
    typeof reqIdHeader === 'string' && reqIdHeader.trim()
      ? reqIdHeader.trim()
      : `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

app.use(express.json());
app.use('/api', (req: Request, res: Response, next) => {
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isOriginAllowed(origin, req)) {
        return callback(null, true);
      }
      return callback(new Error('CORS_ORIGIN_NOT_ALLOWED'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id'],
  })(req, res, next);
});
app.use('/api', (err: Error, _req: Request, res: Response, next: (e?: unknown) => void) => {
  if (err?.message === 'CORS_ORIGIN_NOT_ALLOWED') {
    return sendStructuredError(res, 403, {
      code: 'CORS_FORBIDDEN',
      message: 'Origen no autorizado por la política de seguridad CORS.',
      retryable: false,
    });
  }
  return next(err);
});
app.use('/api', apiRateLimiter);

// Health check endpoint for deployment (Render, Railway, Kubernetes, Vercel)
app.get('/api/health', (_req: Request, res: Response) => {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '');
  const placesConfigured = Boolean(
    (process.env.GOOGLE_PLACES_API_KEY && process.env.GOOGLE_PLACES_API_KEY.trim() !== '') ||
    (process.env.GOOGLE_MAPS_API_KEY && process.env.GOOGLE_MAPS_API_KEY.trim() !== '')
  );
  const weatherConfigured = Boolean(process.env.OPENWEATHER_API_KEY && process.env.OPENWEATHER_API_KEY.trim() !== '');

  res.json({
    status: 'ok',
    app: 'TasteLocal Living',
    version: '1.0 Production',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    cache: {
      ttlMinutes: 25,
    },
    rateLimit: {
      maxRequestsPerMinute: RATE_LIMIT_MAX_GENERATION,
      auxiliaryMaxPerMinute: RATE_LIMIT_MAX_AUXILIARY,
      photosMaxPerMinute: RATE_LIMIT_MAX_PHOTOS,
    },
    services: {
      gemini: geminiConfigured,
      places: placesConfigured,
      weather: weatherConfigured ? 'OpenWeatherMap' : 'Open-Meteo (Active Fallback)',
    },
  });
});

let aiInstance: GoogleGenAI | null = null;
const getAI = (): GoogleGenAI | null => {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) return null;
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiInstance;
};

interface VerifiedPlace {
  id: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: string;
  isOpenNow?: boolean;
  photoUrl?: string;
  types?: string[];
  phoneNumber?: string;
  websiteUri?: string;
  allowsDogs?: boolean;
  verifiedSource: 'google_places' | 'openstreetmap';
  [key: string]: unknown;
}

const getMapsApiKey = (): string => {
  return process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
};

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// In-memory TTL caches (25 min) for places enrichment, photos, places search & weather
const placesEnrichmentCache = new TtlMemoryCache<EnrichedPlaceData>(CACHE_TTL_MS, 600);
const placePhotoCache = new TtlMemoryCache<{ buffer: Buffer; contentType: string }>(CACHE_TTL_MS, 150);
const placesSearchCache = new TtlMemoryCache<VerifiedPlace[]>(CACHE_TTL_MS, 250);
const weatherCache = new TtlMemoryCache<Record<string, unknown>>(CACHE_TTL_MS, 250);

interface EnrichedPlaceData {
  isOpenNow?: boolean;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: string;
  photoUrl?: string;
  phoneNumber?: string;
  websiteUri?: string;
  isLocalSuggestion: boolean;
}

const getCuratedFallbackPhoto = (name: string, types?: string[]): string => {
  const combined = `${name} ${(types || []).join(' ')}`.toLowerCase();
  if (/cafe|café|desayuno|bakery|panader/i.test(combined)) {
    return 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=800&auto=format&fit=crop';
  }
  if (/restauran|bistr|cena|tapas|gastro|taberna/i.test(combined)) {
    return 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop';
  }
  if (/galer|cultur|museo|librer|teatro|monument/i.test(combined)) {
    return 'https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=800&auto=format&fit=crop';
  }
  if (/parque|jard|mirador|playa|rio|sendero|verde/i.test(combined)) {
    return 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=800&auto=format&fit=crop';
  }
  if (/bar|coctel|vermu|pub|copas|rooftop|terraza/i.test(combined)) {
    return 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=800&auto=format&fit=crop';
  }
  return 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop';
};

const formatPriceLevel = (lvl: unknown): string | undefined => {
  if (lvl === undefined || lvl === null) return undefined;
  if (typeof lvl === 'number') {
    if (lvl <= 1) return '€';
    if (lvl === 2) return '€€';
    if (lvl >= 3) return '€€€';
  }
  const str = String(lvl).toUpperCase();
  if (str.includes('INEXPENSIVE') || str === 'FREE') return '€';
  if (str.includes('MODERATE')) return '€€';
  if (str.includes('EXPENSIVE')) return '€€€';
  if (str.includes('VERY_EXPENSIVE')) return '€€€€';
  return undefined;
};

// Live Enrichment function querying Places API (New) with timeout and resilient fallback
const enrichPlaceWithGooglePlaces = async (
  placeName: string,
  placeAddress: string,
  location: { lat: number; lng: number },
  targetCity: string
): Promise<EnrichedPlaceData> => {
  const cacheKey = `${placeName.toLowerCase().trim()}|${location.lat.toFixed(3)},${location.lng.toFixed(3)}`;
  if (placesEnrichmentCache.has(cacheKey)) {
    return placesEnrichmentCache.get(cacheKey)!;
  }

  const apiKey = getMapsApiKey();
  const fallbackPhoto = getCuratedFallbackPhoto(placeName);

  if (!apiKey) {
    const result: EnrichedPlaceData = {
      isLocalSuggestion: true,
      photoUrl: fallbackPhoto,
    };
    placesEnrichmentCache.set(cacheKey, result);
    return result;
  }

  try {
    const url = 'https://places.googleapis.com/v1/places:searchText';
    const body = {
      textQuery: `${placeName} ${targetCity}`,
      locationBias: {
        circle: {
          center: { latitude: location.lat, longitude: location.lng },
          radius: 3000.0,
        },
      },
      languageCode: 'es',
      maxResultCount: 1,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const gRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.regularOpeningHours,places.currentOpeningHours,places.photos,places.nationalPhoneNumber,places.websiteUri',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    if (gRes.ok) {
      const data = await gRes.json();
      if (data.places && data.places.length > 0) {
        const p = data.places[0];
        const openNow =
          p.currentOpeningHours?.openNow ??
          p.regularOpeningHours?.openNow;

        let photoUrl = fallbackPhoto;
        if (p.photos && p.photos.length > 0 && p.photos[0].name) {
          photoUrl = `/api/place-photo?name=${encodeURIComponent(p.photos[0].name)}`;
        }

        const result: EnrichedPlaceData = {
          isOpenNow: typeof openNow === 'boolean' ? openNow : undefined,
          rating: typeof p.rating === 'number' ? p.rating : undefined,
          userRatingsTotal: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
          priceLevel: formatPriceLevel(p.priceLevel),
          photoUrl,
          phoneNumber: p.nationalPhoneNumber,
          websiteUri: p.websiteUri,
          isLocalSuggestion: false,
        };

        placesEnrichmentCache.set(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.warn(`[Places Enrichment] Fallback seguro para "${placeName}":`, (err as Error)?.message || err);
  }

  const fallbackResult: EnrichedPlaceData = {
    isLocalSuggestion: true,
    photoUrl: fallbackPhoto,
  };
  placesEnrichmentCache.set(cacheKey, fallbackResult);
  return fallbackResult;
};

// Endpoint proxy for secure photo delivery without leaking GOOGLE_PLACES_API_KEY (cached 25 min)
app.get('/api/place-photo', async (req: Request, res: Response) => {
  try {
    const photoName = String(req.query.name || req.query.photoName || '');
    const photoRef = String(req.query.ref || req.query.photoReference || '');
    const photoCacheKey = photoName ? `name:${photoName}` : photoRef ? `ref:${photoRef}` : '';

    if (photoCacheKey) {
      const cachedPhoto = placePhotoCache.get(photoCacheKey);
      if (cachedPhoto) {
        res.setHeader('Content-Type', cachedPhoto.contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        res.setHeader('X-Cache', 'HIT');
        return res.send(cachedPhoto.buffer);
      }
    }

    const apiKey = getMapsApiKey();
    const isValidPhotoName = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(photoName);

    if (photoName && isValidPhotoName && apiKey) {
      try {
        const gUrl = `https://places.googleapis.com/v1/${photoName}/media?key=${apiKey}&maxHeightPx=800&maxWidthPx=800`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const imgRes = await fetch(gUrl, { signal: controller.signal }).finally(() => clearTimeout(timeoutId));
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          placePhotoCache.set(photoCacheKey, { buffer, contentType });
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
          res.setHeader('X-Cache', 'MISS');
          return res.send(buffer);
        }
      } catch (pErr) {
        console.warn('Place photo proxy fetch error, falling back:', (pErr as Error)?.message);
      }
    }

    if (photoRef && /^[A-Za-z0-9_-]{10,}$/.test(photoRef) && apiKey) {
      try {
        const gUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${encodeURIComponent(photoRef)}&key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const imgRes = await fetch(gUrl, { signal: controller.signal }).finally(() => clearTimeout(timeoutId));
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          placePhotoCache.set(photoCacheKey, { buffer, contentType });
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
          res.setHeader('X-Cache', 'MISS');
          return res.send(buffer);
        }
      } catch (pErr) {
        console.warn('Place photo legacy ref proxy fetch error, falling back:', (pErr as Error)?.message);
      }
    }

    // High quality contextual redirect fallback
    const category = String(req.query.category || req.query.q || '');
    return res.redirect(getCuratedFallbackPhoto(category));
  } catch (error) {
    console.error('Place photo endpoint unexpected error:', error);
    return res.redirect('https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop');
  }
});

class GeminiTimeoutError extends Error {
  readonly code = 'GEMINI_TIMEOUT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'GeminiTimeoutError';
  }
}

async function callGeminiWithResilience(params: {
  contents: string;
  responseSchema?: Record<string, unknown>;
}) {
  const ai = getAI();
  if (!ai) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const primaryModel = process.env.GEMINI_MODEL_PRIMARY || 'gemini-3.1-flash-lite';
  const fallbackModel = process.env.GEMINI_MODEL_FALLBACK || 'gemini-3.8-flash';
  const models = [primaryModel, fallbackModel];

  const TOTAL_BUDGET_MS = 25000;
  const PRIMARY_MAX_MS = 15000;
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  let lastError: unknown;
  let sawTimeout = false;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const remainingTotalMs = deadline - Date.now();
    if (remainingTotalMs <= 500) {
      throw new GeminiTimeoutError('Tiempo máximo de espera agotado para Gemini (25s).');
    }

    const attemptBudgetMs = i === 0 ? Math.min(PRIMARY_MAX_MS, remainingTotalMs) : remainingTotalMs;
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, attemptBudgetMs);

    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: {
          abortSignal: controller.signal,
          responseMimeType: 'application/json',
          ...(params.responseSchema ? { responseSchema: params.responseSchema as never } : {}),
        },
      });
      return response;
    } catch (err: unknown) {
      const isAbortOrTimeout =
        timedOut || (err instanceof Error && err.name === 'AbortError');
      if (isAbortOrTimeout) {
        sawTimeout = true;
        lastError = new GeminiTimeoutError(
          `Timeout esperando respuesta de Gemini (${model}, ${attemptBudgetMs}ms)`
        );
      } else {
        lastError = err;
      }
      console.warn(`Model ${model} unavailable, failing over to alternative:`, lastError);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  if (sawTimeout && !(lastError instanceof GeminiTimeoutError)) {
    throw new GeminiTimeoutError('Se agotó el presupuesto total de tiempo para Gemini.');
  }
  throw lastError;
}

// Shared Real-Places Discovery Service (Google Places API + OpenStreetMap Overpass node/way/relation)
// NEVER fabricates synthetic places or coordinates.
async function searchVerifiedPlacesInArea(params: {
  query: string;
  lat: number;
  lng: number;
  radiusKm: number;
}): Promise<{ places: VerifiedPlace[]; cacheHit: boolean; sourceFailed: boolean }> {
  const radiusKm = Math.min(50, Math.max(1, Number(params.radiusKm || 5)));
  const radiusMeters = Math.round(radiusKm * 1000);
  const queryStr = String(params.query || '').trim();
  const cacheKey = `${Number(params.lat).toFixed(2)},${Number(params.lng).toFixed(2)}|r:${radiusKm}|${queryStr.toLowerCase()}`;

  const cached = placesSearchCache.get(cacheKey);
  if (cached) {
    return { places: cached, cacheHit: true, sourceFailed: false };
  }

  const apiKey = getMapsApiKey();
  const collected: VerifiedPlace[] = [];
  const seenIds = new Set<string>();
  const seenNameCoords: Array<{ name: string; lat: number; lng: number }> = [];
  let googleSucceeded = false;
  let overpassSucceeded = false;

  const tryPushPlace = (candidate: VerifiedPlace) => {
    if (!candidate.id || !candidate.name) return;
    if (
      typeof candidate.location?.lat !== 'number' ||
      typeof candidate.location?.lng !== 'number' ||
      isNaN(candidate.location.lat) ||
      isNaN(candidate.location.lng)
    ) {
      return;
    }

    const distKm = haversineDistanceKm(
      params.lat,
      params.lng,
      candidate.location.lat,
      candidate.location.lng
    );
    if (distKm > radiusKm) return;

    if (seenIds.has(candidate.id)) return;
    const normName = candidate.name.toLowerCase().trim();
    const isNearDuplicate = seenNameCoords.some(
      (prev) =>
        prev.name === normName &&
        haversineDistanceKm(prev.lat, prev.lng, candidate.location.lat, candidate.location.lng) < 0.08
    );
    if (isNearDuplicate) return;

    seenIds.add(candidate.id);
    seenNameCoords.push({ name: normName, lat: candidate.location.lat, lng: candidate.location.lng });
    collected.push(candidate);
  };

  // Source A: Google Places API (New)
  if (apiKey && queryStr) {
    try {
      const url = 'https://places.googleapis.com/v1/places:searchText';
      const body = {
        textQuery: queryStr,
        locationBias: {
          circle: {
            center: { latitude: params.lat, longitude: params.lng },
            radius: Math.min(50000, radiusMeters),
          },
        },
        languageCode: 'es',
        maxResultCount: 10,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const gRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.regularOpeningHours,places.currentOpeningHours,places.photos,places.types,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.allowsDogs,places.accessibilityOptions',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (gRes.ok) {
        googleSucceeded = true;
        const data = (await gRes.json()) as {
          places?: Array<{
            id?: string;
            displayName?: { text?: string };
            formattedAddress?: string;
            location?: { latitude?: number; longitude?: number };
            rating?: number;
            userRatingCount?: number;
            priceLevel?: unknown;
            regularOpeningHours?: { openNow?: boolean };
            currentOpeningHours?: { openNow?: boolean };
            photos?: Array<{ name?: string }>;
            types?: string[];
            nationalPhoneNumber?: string;
            internationalPhoneNumber?: string;
            websiteUri?: string;
            allowsDogs?: boolean;
            accessibilityOptions?: {
              wheelchairAccessibleEntrance?: boolean;
              wheelchairAccessibleParking?: boolean;
              wheelchairAccessibleRestroom?: boolean;
              wheelchairAccessibleSeating?: boolean;
            };
          }>;
        };

        if (Array.isArray(data.places)) {
          for (const p of data.places) {
            if (!p.id || typeof p.location?.latitude !== 'number' || typeof p.location?.longitude !== 'number') {
              continue;
            }
            const isConfirmed = Boolean(
              p.accessibilityOptions?.wheelchairAccessibleEntrance ||
                p.accessibilityOptions?.wheelchairAccessibleParking ||
                p.accessibilityOptions?.wheelchairAccessibleRestroom ||
                p.accessibilityOptions?.wheelchairAccessibleSeating
            );
            const openNow = p.currentOpeningHours?.openNow ?? p.regularOpeningHours?.openNow;
            const photoName = p.photos?.[0]?.name;

            tryPushPlace({
              id: p.id,
              name: p.displayName?.text || 'Lugar de interés',
              address: p.formattedAddress || 'Ubicación verificada',
              location: { lat: p.location.latitude, lng: p.location.longitude },
              rating: typeof p.rating === 'number' ? p.rating : undefined,
              userRatingsTotal: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
              priceLevel: formatPriceLevel(p.priceLevel),
              isOpenNow: typeof openNow === 'boolean' ? openNow : undefined,
              photoUrl: photoName ? `/api/place-photo?name=${encodeURIComponent(photoName)}` : undefined,
              types: p.types || [],
              phoneNumber: p.nationalPhoneNumber || p.internationalPhoneNumber,
              websiteUri: p.websiteUri,
              allowsDogs:
                p.allowsDogs ??
                (p.types?.some((t) => ['park', 'garden', 'dog_park', 'national_park'].includes(t))
                  ? true
                  : undefined),
              verifiedSource: 'google_places',
              accessibilityOptions: isConfirmed
                ? { ...p.accessibilityOptions, isConfirmedAccessible: true }
                : undefined,
            });
          }
        }
      }
    } catch (gErr) {
      console.warn('Google Places New API error:', (gErr as Error)?.message || gErr);
    }
  }

  // Source B & C: OpenStreetMap Overpass API (node, way, relation with out center & 5500ms timeout) + OpenStreetMap Photon POI fallback
  let photonSucceeded = false;
  if (collected.length < 4) {
    const overpassCandidates: VerifiedPlace[] = [];
    const photonCandidates: VerifiedPlace[] = [];

    const runOverpass = async () => {
      try {
        const overpassQuery = `[out:json][timeout:6];(
          node["tourism"](around:${radiusMeters},${params.lat},${params.lng});
          way["tourism"](around:${radiusMeters},${params.lat},${params.lng});
          relation["tourism"](around:${radiusMeters},${params.lat},${params.lng});
          node["amenity"~"cafe|restaurant|bar|arts_centre|library|theatre"](around:${radiusMeters},${params.lat},${params.lng});
          way["amenity"~"cafe|restaurant|bar|arts_centre|library|theatre"](around:${radiusMeters},${params.lat},${params.lng});
          relation["amenity"~"cafe|restaurant|bar|arts_centre|library|theatre"](around:${radiusMeters},${params.lat},${params.lng});
          node["leisure"~"park|garden|playground|nature_reserve"](around:${radiusMeters},${params.lat},${params.lng});
          way["leisure"~"park|garden|playground|nature_reserve"](around:${radiusMeters},${params.lat},${params.lng});
          relation["leisure"~"park|garden|playground|nature_reserve"](around:${radiusMeters},${params.lat},${params.lng});
        );out center 35;`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const opRes = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'TasteLocalLiving/1.0 (contact: info@tastelocal.app)',
            Accept: 'application/json',
          },
          body: `data=${encodeURIComponent(overpassQuery)}`,
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (opRes.ok) {
          overpassSucceeded = true;
          const opData = (await opRes.json()) as {
            elements?: Array<{
              type?: string;
              id: number;
              lat?: number;
              lon?: number;
              center?: { lat?: number; lon?: number };
              tags?: Record<string, string>;
            }>;
          };

          if (Array.isArray(opData.elements)) {
            for (const el of opData.elements) {
              const tags = el.tags || {};
              const elName = tags['name:es'] || tags.name;
              const elLat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
              const elLng = typeof el.lon === 'number' ? el.lon : el.center?.lon;
              if (!elName || typeof elLat !== 'number' || typeof elLng !== 'number') continue;

              const elType = el.type || 'node';
              const isPetFriendly =
                tags['dog'] === 'yes' ||
                tags['pets_allowed'] === 'yes' ||
                tags['leisure'] === 'park' ||
                tags['leisure'] === 'garden'
                  ? true
                  : undefined;

              overpassCandidates.push({
                id: `osm-${elType}-${el.id}`,
                name: elName,
                address:
                  [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']]
                    .filter(Boolean)
                    .join(' ') || `Coordenadas ${elLat.toFixed(4)}, ${elLng.toFixed(4)}`,
                location: { lat: elLat, lng: elLng },
                rating: undefined,
                types: [tags.amenity || tags.tourism || tags.leisure || 'point_of_interest'],
                phoneNumber: tags['phone'] || tags['contact:phone'] || undefined,
                websiteUri: tags['website'] || tags['contact:website'] || undefined,
                allowsDogs: isPetFriendly,
                verifiedSource: 'openstreetmap',
                accessibilityOptions:
                  tags['wheelchair'] === 'yes'
                    ? { wheelchairAccessibleEntrance: true, isConfirmedAccessible: true }
                    : undefined,
              });
            }
          }
        }
      } catch (opErr) {
        console.warn('Overpass API query warning:', (opErr as Error)?.message || opErr);
      }
    };

    const runPhotonOsm = async () => {
      try {
        const lowerQ = queryStr.toLowerCase();
        const candidateKeywords = [
          'cafe',
          'cafeteria',
          'restaurante',
          'bistro',
          'tapas',
          'parque',
          'jardin',
          'museo',
          'galeria',
          'libreria',
          'mirador',
          'teatro',
          'playa',
          'bar',
        ];
        const matchedTerms = candidateKeywords.filter((kw) =>
          lowerQ.normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(kw)
        );
        const searchTerms = Array.from(
          new Set(matchedTerms.length > 0 ? [...matchedTerms.slice(0, 3), 'cafe', 'parque'] : ['cafe', 'restaurante', 'parque', 'museo'])
        ).slice(0, 4);

        const ALLOWED_OSM_KEYS = new Set(['amenity', 'tourism', 'leisure', 'historic', 'shop', 'craft']);

        await Promise.allSettled(
          searchTerms.map(async (term) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            try {
              const pUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&lat=${params.lat}&lon=${params.lng}&limit=8`;
              const pRes = await fetch(pUrl, {
                headers: { 'User-Agent': 'TasteLocalLiving/1.0 (contact: info@tastelocal.app)' },
                signal: controller.signal,
              });
              if (!pRes.ok) return;
              photonSucceeded = true;
              const pData = (await pRes.json()) as {
                features?: Array<{
                  geometry?: { coordinates?: [number, number] };
                  properties?: {
                    osm_type?: string;
                    osm_id?: number;
                    osm_key?: string;
                    osm_value?: string;
                    name?: string;
                    street?: string;
                    housenumber?: string;
                    city?: string;
                    district?: string;
                  };
                }>;
              };

              if (Array.isArray(pData.features)) {
                for (const feat of pData.features) {
                  const props = feat.properties || {};
                  const coords = feat.geometry?.coordinates;
                  if (
                    !props.name ||
                    !props.osm_id ||
                    !Array.isArray(coords) ||
                    coords.length < 2 ||
                    !props.osm_key ||
                    !ALLOWED_OSM_KEYS.has(props.osm_key)
                  ) {
                    continue;
                  }

                  const featLng = Number(coords[0]);
                  const featLat = Number(coords[1]);
                  if (isNaN(featLat) || isNaN(featLng)) continue;

                  const osmTypeMap: Record<string, string> = { N: 'node', W: 'way', R: 'relation' };
                  const elType = osmTypeMap[String(props.osm_type || 'N').toUpperCase()] || 'node';
                  const addr = [props.street, props.housenumber, props.district || props.city]
                    .filter(Boolean)
                    .join(' ');
                  const osmVal = props.osm_value || props.osm_key || 'point_of_interest';
                  const isPark = ['park', 'garden', 'nature_reserve', 'dog_park'].includes(osmVal);

                  photonCandidates.push({
                    id: `osm-${elType}-${props.osm_id}`,
                    name: props.name,
                    address: addr || `Coordenadas ${featLat.toFixed(4)}, ${featLng.toFixed(4)}`,
                    location: { lat: featLat, lng: featLng },
                    rating: undefined,
                    types: [osmVal],
                    allowsDogs: isPark ? true : undefined,
                    verifiedSource: 'openstreetmap',
                  });
                }
              }
            } finally {
              clearTimeout(timeoutId);
            }
          })
        );
      } catch (phErr) {
        console.warn('Photon OSM search warning:', (phErr as Error)?.message || phErr);
      }
    };

    await Promise.allSettled([runOverpass(), runPhotonOsm()]);

    for (const c of overpassCandidates) tryPushPlace(c);
    for (const c of photonCandidates) tryPushPlace(c);
  }

  const results = collected.slice(0, 12);
  if (results.length > 0) {
    placesSearchCache.set(cacheKey, results);
  }

  const sourceFailed = !googleSucceeded && !overpassSucceeded && !photonSucceeded && results.length === 0;
  return {
    places: results,
    cacheHit: false,
    sourceFailed,
  };
}

// 1. Analyze mood from voice transcription or user text
app.post('/api/gemini/analyze-mood', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return sendStructuredError(res, 400, {
        code: 'INVALID_REQUEST',
        message: 'Debes indicar un texto o descripción para interpretar tu estado de ánimo.',
        retryable: false,
      });
    }

    const prompt = `Analiza el siguiente texto de un usuario expresando cómo se siente o qué le apetece hacer:
"${text}"

Determina cuál de los siguientes estados de ánimo predefinidos coincide mejor:
- Relajado (icon: 😌)
- Aventurero (icon: 🤠)
- Romántico (icon: 🥰)
- Festivo (icon: 🥳)
- Curioso (icon: 🧐)
- Tranquilo (icon: 🧘)

Responde en formato JSON con la siguiente estructura:
{
  "label": "uno de los 6 nombres exactos indicados",
  "icon": "el emoji correspondiente"
}`;

    const response = await callGeminiWithResilience({
      contents: prompt,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          icon: { type: Type.STRING },
        },
        required: ['label', 'icon'],
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const validLabels: Record<string, string> = {
      Relajado: '😌',
      Aventurero: '🤠',
      Romántico: '🥰',
      Festivo: '🥳',
      Curioso: '🧐',
      Tranquilo: '🧘',
    };

    const label = validLabels[parsed.label] ? parsed.label : 'Relajado';
    const icon = validLabels[label] || '😌';

    return res.json({ mood: { label, icon } });
  } catch (error) {
    console.error('Error analyzing mood:', error);
    return res.json({ mood: { label: 'Relajado', icon: '😌' } });
  }
});

// Fallback determinista usando ÚNICAMENTE lugares reales ya verificados (nunca inventa sitios)
function buildVerifiedFallbackItinerary(params: {
  verifiedPlaces: VerifiedPlace[];
  criteria: Record<string, any>;
  weather: Record<string, any> | null;
  targetCity: string;
  searchRadiusKm: number;
}): Record<string, unknown> | null {
  const { verifiedPlaces, criteria, weather, targetCity } = params;
  if (!verifiedPlaces || verifiedPlaces.length === 0) return null;

  const isFamily = criteria.company === 'En Familia';
  const isKids = criteria.company === 'Con Niños';
  const isFamilyOrKids = isFamily || isKids;
  const isSingleMode = criteria.experienceMode === 'single';
  const isBadWeather = Boolean(weather?.isRainy);
  const mood = criteria.user_mood || 'Relajado';

  const safePlaces = isKids
    ? verifiedPlaces.filter((p) => {
        const types = (p.types || []).map((t) => t.toLowerCase());
        const nightName = /discoteca|pub nocturno|night_club|cocteler[ií]a/i.test(p.name);
        return !types.includes('night_club') && !nightName;
      })
    : verifiedPlaces;

  const pool = safePlaces.length > 0 ? safePlaces : verifiedPlaces;
  if (pool.length === 0) return null;

  const stopsPerPlan = isSingleMode ? 1 : Math.min(3, pool.length);

  const pickStops = (offset: number): Array<Record<string, unknown>> => {
    const chosen: VerifiedPlace[] = [];
    for (let i = 0; i < stopsPerPlan; i++) {
      chosen.push(pool[(offset + i) % pool.length]);
    }
    const baseHour = new Date().getHours();
    return chosen.map((vp, idx) => {
      const hour = (baseHour + 1 + idx * 2) % 24;
      const timeStr = `${String(hour).padStart(2, '0')}:00`;
      return {
        order: idx + 1,
        time: timeStr,
        activity: `Visita verificada en ${vp.name}`,
        walkingTimeFromPrevious:
          idx === 0
            ? 'Punto de inicio'
            : isFamilyOrKids
            ? `${8 + idx * 2} min caminando (ritmo pausado)`
            : `${6 + idx * 2} min caminando`,
        placeId: vp.id,
        placeName: vp.name,
        placeAddress: vp.address,
        location: vp.location,
        rating: vp.rating,
        userRatingsTotal: vp.userRatingsTotal,
        priceLevel: vp.priceLevel,
        isOpenNow: vp.isOpenNow,
        photoUrl: vp.photoUrl || getCuratedFallbackPhoto(vp.name, vp.types),
        phoneNumber: vp.phoneNumber,
        websiteUri: vp.websiteUri,
        allowsDogs: vp.allowsDogs,
        verifiedSource: vp.verifiedSource,
        isLocalSuggestion: false,
        accessibilityOptions: vp.accessibilityOptions,
        description: `Lugar real verificado en ${targetCity} (${vp.address}).`,
      };
    });
  };

  const configs = [
    {
      id: 'ideal',
      badge: 'PLAN IDEAL',
      tagline: 'Selección real verificada en tu radio',
      title: `Selección Verificada: ${mood} en ${targetCity}`,
      offset: 0,
    },
    {
      id: 'alternative',
      badge: 'PLAN ALTERNATIVO',
      tagline: 'Enfoque complementario verificado',
      title: `Alternativa Local Verificada en ${targetCity}`,
      offset: pool.length > 1 ? 1 : 0,
    },
    {
      id: 'surprise',
      badge: 'PLAN SORPRESA',
      tagline: 'Combinación alternativa de lugares reales',
      title: `Propuesta Complementaria en ${targetCity}`,
      offset: pool.length > 2 ? 2 : 0,
    },
  ];

  const proposals = configs.map((cfg) => {
    const schedule = pickStops(cfg.offset);
    const primary = schedule[0];
    return {
      id: cfg.id,
      badge: cfg.badge,
      tagline: cfg.tagline,
      title: cfg.title,
      shortDescription: `Itinerario construido directamente con lugares reales verificados dentro de ${params.searchRadiusKm} km en ${targetCity}.`,
      matchReason: `Todos los puntos incluidos cuentan con identificador y coordenadas verificadas en ${targetCity}.`,
      approxDuration: criteria.availableTime || '2 a 4 horas',
      experienceNarrative: `Selección directa sobre fuentes verificadas en ${targetCity} respetando tu radio de búsqueda (${params.searchRadiusKm} km) y ritmo (${criteria.intensity || 6}/10).`,
      accessibilityInfo: isFamilyOrKids
        ? 'Trayectos cortos pensados para un ritmo pausado.'
        : 'Ubicaciones reales verificadas en el entorno seleccionado.',
      budgetEstimate: criteria.budget || 'Según consumo local',
      energyRequired: isFamilyOrKids ? 'Ritmo pausado' : `Ritmo ${criteria.intensity || 6}/10`,
      schedule,
      photoUrl: primary?.photoUrl,
      isOpenNow: primary?.isOpenNow,
      rating: primary?.rating,
      userRatingsTotal: primary?.userRatingsTotal,
      priceLevel: primary?.priceLevel,
      isPlanB: isBadWeather,
    };
  });

  return {
    proposals,
    mainPlan: proposals[0],
    premiumContingencyPlan: {
      ...proposals[1],
      reasonForChange: proposals[1].matchReason,
    },
    isGeographicallyOptimized: true,
    isPlanBActive: isBadWeather,
    aiFallbackNotice:
      'El asistente narrativo de IA no respondió a tiempo, pero hemos montado tu itinerario utilizando únicamente lugares reales verificados en tu radio de búsqueda.',
  };
}

// 2. Generate Itinerary Handler (Support both /api/gemini/generate-itinerary and /api/generate)
const handleGenerateItinerary = async (req: Request, res: Response) => {
  let effectivePoolForFallback: VerifiedPlace[] = [];
  let fallbackCriteria: Record<string, any> = {};
  let fallbackWeather: Record<string, any> | null = null;
  let fallbackTargetCity = 'tu zona';
  let fallbackRadiusKm = 5;

  try {
    const { criteria, weather, places, latitude, longitude, searchRadiusKm, gpsLocation } = req.body || {};

    if (!criteria || !criteria.location) {
      return sendStructuredError(res, 400, {
        code: 'INVALID_REQUEST',
        message: 'Debes indicar criterios válidos y una ubicación para generar el plan.',
        retryable: false,
      });
    }

    fallbackCriteria = criteria;
    fallbackWeather = weather || null;

    const exactLat =
      typeof latitude === 'number'
        ? latitude
        : typeof gpsLocation?.latitude === 'number'
        ? gpsLocation.latitude
        : criteria.location?.lat;

    const exactLng =
      typeof longitude === 'number'
        ? longitude
        : typeof gpsLocation?.longitude === 'number'
        ? gpsLocation.longitude
        : criteria.location?.lng;

    if (typeof exactLat !== 'number' || typeof exactLng !== 'number' || isNaN(exactLat) || isNaN(exactLng)) {
      return sendStructuredError(res, 400, {
        code: 'INVALID_REQUEST',
        message: 'Las coordenadas de búsqueda no son válidas.',
        retryable: false,
      });
    }

    const searchRadius = Math.min(
      50,
      Math.max(
        1,
        Number(
          searchRadiusKm ||
            gpsLocation?.searchRadiusKm ||
            criteria.searchRadiusKm ||
            (criteria.environment === 'Escapada' ? 15 : 5)
        )
      )
    );
    fallbackRadiusKm = searchRadius;

    const isGpsActive = Boolean(
      criteria.isGpsActive ||
        criteria.location?.isGps ||
        gpsLocation ||
        (typeof latitude === 'number' && typeof longitude === 'number')
    );

    const userLocation = {
      lat: exactLat,
      lng: exactLng,
      cityName: criteria.cityName || criteria.location?.cityName,
      formattedAddress: criteria.location?.formattedAddress,
      neighborhood: criteria.location?.neighborhood,
      isGps: isGpsActive,
      accuracyMeters: criteria.location?.accuracyMeters,
    };

    const targetCity =
      criteria.cityName ||
      criteria.location?.cityName ||
      (typeof criteria.location?.formattedAddress === 'string'
        ? criteria.location.formattedAddress.split(',')[0].trim()
        : '') ||
      'el municipio seleccionado';
    fallbackTargetCity = targetCity;

    const isEscapadaMode =
      criteria.environment === 'Escapada' ||
      searchRadius >= 15 ||
      Boolean(criteria.allowSurroundings);

    const rawVisited = Array.isArray(req.body?.visitedPlaces)
      ? req.body.visitedPlaces
      : Array.isArray(criteria.visitedPlaces)
      ? criteria.visitedPlaces
      : [];
    const visitedPlaces: Array<{ id?: string; name?: string }> = rawVisited.filter(
      (vp: any) => vp && (typeof vp.name === 'string' || typeof vp.id === 'string')
    );
    const visitedIdSet = new Set(
      visitedPlaces.map((vp) => String(vp.id || '').toLowerCase().trim()).filter(Boolean)
    );
    const visitedNameSet = new Set(
      visitedPlaces.map((vp) => String(vp.name || '').toLowerCase().trim()).filter(Boolean)
    );
    const isPlaceAlreadyVisited = (id?: string, name?: string): boolean => {
      const normId = String(id || '').toLowerCase().trim();
      const normName = String(name || '').toLowerCase().trim();
      if (normId && visitedIdSet.has(normId)) return true;
      if (normName && visitedNameSet.has(normName)) return true;
      if (normName) {
        for (const vName of visitedNameSet) {
          if (vName.length > 3 && (normName.includes(vName) || vName.includes(normName))) {
            return true;
          }
        }
      }
      return false;
    };

    const visitedNamesList = visitedPlaces
      .map((vp) => (typeof vp.name === 'string' ? vp.name.trim() : ''))
      .filter(Boolean);

    const SYNTHETIC_ID_REGEX = /^(poi-|resilient-poi-|gemini-poi-|group-card-)/i;
    let verifiedPlacesList: VerifiedPlace[] = Array.isArray(places)
      ? places
          .filter(
            (p: any) =>
              p &&
              typeof p.id === 'string' &&
              p.id.trim() !== '' &&
              !SYNTHETIC_ID_REGEX.test(p.id) &&
              typeof p.name === 'string' &&
              typeof p.location?.lat === 'number' &&
              typeof p.location?.lng === 'number' &&
              haversineDistanceKm(exactLat, exactLng, p.location.lat, p.location.lng) <= searchRadius
          )
          .map((p: any) => ({
            ...p,
            verifiedSource:
              p.verifiedSource === 'openstreetmap' || String(p.id).startsWith('osm-')
                ? 'openstreetmap'
                : 'google_places',
          }))
      : [];

    // Si el cliente no aportó lugares verificados suficientes, buscar directamente en fuentes reales (Google Places / Overpass) con searchRadius
    let mapLookupFailed = false;
    if (verifiedPlacesList.length < 2) {
      const queryHints = [
        `${criteria.environment || 'Ciudad'} ${targetCity}`,
        criteria.company === 'Con Niños'
          ? `parque infantil cafeteria familiar ${targetCity}`
          : criteria.company === 'En Familia'
          ? `restaurante familiar paseo mirador ${targetCity}`
          : `cafe restaurante museo parque ${targetCity}`,
      ];

      const seenIds = new Set(verifiedPlacesList.map((p) => p.id));
      let anySourceSucceeded = false;

      for (const hint of queryHints) {
        const searchRes = await searchVerifiedPlacesInArea({
          query: hint,
          lat: exactLat,
          lng: exactLng,
          radiusKm: searchRadius,
        });
        if (!searchRes.sourceFailed) anySourceSucceeded = true;
        for (const vp of searchRes.places) {
          if (!seenIds.has(vp.id)) {
            seenIds.add(vp.id);
            verifiedPlacesList.push(vp);
          }
        }
        if (verifiedPlacesList.length >= 10) break;
      }

      if (!anySourceSucceeded && verifiedPlacesList.length === 0) {
        mapLookupFailed = true;
      }
    }

    if (mapLookupFailed && verifiedPlacesList.length === 0) {
      return sendStructuredError(res, 503, {
        code: 'MAPS_UNAVAILABLE',
        message:
          'No pudimos consultar los servicios de mapas y lugares en este momento. Inténtalo de nuevo en unos segundos.',
        retryable: true,
      });
    }

    const unvisitedVerifiedPlaces = verifiedPlacesList.filter(
      (p) => !isPlaceAlreadyVisited(p.id, p.name)
    );
    const effectivePlacesPool =
      unvisitedVerifiedPlaces.length > 0 ? unvisitedVerifiedPlaces : [];
    effectivePoolForFallback = effectivePlacesPool;

    if (effectivePlacesPool.length === 0) {
      const allExcludedByVisited =
        verifiedPlacesList.length > 0 && unvisitedVerifiedPlaces.length === 0;
      const canExpandRadius = searchRadius < 15;
      return sendStructuredError(res, 404, {
        code: canExpandRadius ? 'NO_VERIFIED_PLACES_IN_RADIUS' : 'NO_VERIFIED_PLACES',
        message: allExcludedByVisited
          ? `Ya marcaste como visitados los lugares verificados encontrados en un radio de ${searchRadius} km.${canExpandRadius ? ' Amplía el radio a 15 km para descubrir nuevos sitios.' : ' Prueba otra zona o revisa tu lista de visitados.'}`
          : canExpandRadius
          ? `No encontramos lugares reales verificados en un radio de ${searchRadius} km alrededor de ${targetCity}. Prueba ampliar el radio de búsqueda a 15 km.`
          : `No encontramos lugares reales verificados en un radio de ${searchRadius} km con esas preferencias. Prueba otra zona o ajusta los filtros.`,
        retryable: false,
        extra: canExpandRadius ? { suggestedRadiusKm: 15 } : undefined,
      });
    }

    const verifiedById = new Map<string, VerifiedPlace>();
    const verifiedByName = new Map<string, VerifiedPlace>();

    effectivePlacesPool.forEach((p) => {
      verifiedById.set(p.id, p);
      verifiedByName.set(p.name.toLowerCase().trim(), p);
    });

    const availablePlacesDescription = effectivePlacesPool
      .map(
        (p) => {
          const isPetFriendlyKnown =
            p.allowsDogs === true ||
            (Array.isArray(p.types) && p.types.some((t) => ['park', 'garden', 'dog_park', 'national_park'].includes(t)));
          return `[ID: "${p.id}"] Nombre: "${p.name}", Dirección: "${p.address || 'Ubicación local'}", Rating: ${
            p.rating || 'N/A'
          }, Lat: ${p.location?.lat}, Lng: ${p.location?.lng}, PetFriendly: ${isPetFriendlyKnown ? 'SÍ (Confirmado)' : 'Consultar terraza'}`;
        }
      )
      .join('\n');

    // 1. Contexto Horario Dinámico
    const now = new Date();
    let currentHour = now.getHours();
    let timeStr = `${String(currentHour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (typeof criteria.localTime === 'string' && criteria.localTime.includes(':')) {
      const parts = criteria.localTime.split(':');
      const parsedHour = parseInt(parts[0], 10);
      if (!isNaN(parsedHour) && parsedHour >= 0 && parsedHour <= 23) {
        currentHour = parsedHour;
        timeStr = criteria.localTime;
      }
    }

    let timePeriodName = 'Mañana';
    let timeGuidance = 'Apertura de jornada: Desayunos de especialidad, cafeterías luminosas, paseos culturales y activación paulatina.';
    if (currentHour >= 6 && currentHour < 13) {
      timePeriodName = 'Mañana';
      timeGuidance = 'Apertura de jornada: Desayunos de especialidad, cafeterías luminosas, paseos culturales y activación paulatina.';
    } else if (currentHour >= 13 && currentHour < 17) {
      timePeriodName = 'Mediodía / Comida';
      timeGuidance = 'Momento gastronómico central: Bistrós con encanto, cocina de mercado, sobremesa pausada y espacios culturales resguardados.';
    } else if (currentHour >= 17 && currentHour < 20) {
      timePeriodName = 'Tarde / Tardeo';
      timeGuidance = 'Pausa vespertina: Cafés de autor, vermuterías, librerías acogedoras, atardecer y galerías artísticas.';
    } else {
      timePeriodName = 'Noche';
      timeGuidance = 'Velada nocturna: Cenas íntimas con sabor local, coctelería de autor, iluminación cálida y atmósfera relajante.';
    }

    // 2. Modo Lluvia / Mal Tiempo
    const isBadWeather =
      Boolean(weather?.isRainy) ||
      weather?.alertLevel === 'warning' ||
      weather?.alertLevel === 'severe' ||
      (typeof weather?.condition === 'string' && /lluvia|tormenta|chubasco|nieve|drizzle|rain/i.test(weather.condition));

    const weatherDirective = isBadWeather
      ? `\n⚠️ MODO LLUVIA / MAL TIEMPO ACTIVO (${weather?.condition || 'Precipitaciones'}, ${weather?.temp ?? 'N/D'}°C):
OBLIGATORIO: Se detectan precipitaciones o clima adverso. DEBES priorizar de forma ESTRICTA lugares 100% a cubierto, íntimos y acogedores (cafeterías de especialidad, galerías de arte, talleres, librerías con encanto, bistrós protegidos). Evita parques abiertos o largas caminatas desprotegidas. En "matchReason" resalta cómo el plan refugia al usuario con calidez del mal tiempo.`
      : '';

    // 3. Memoria de Preferencias & Mood Intelligence Progresivo
    let userAffinitiesDirective = '';
    if (criteria.userAffinities) {
      const parts: string[] = [];
      if (criteria.userAffinities.topEnvironments && criteria.userAffinities.topEnvironments.length > 0) {
        parts.push(`• Entornos más frecuentes/valorados: ${criteria.userAffinities.topEnvironments.join(', ')}`);
      }
      if (criteria.userAffinities.topMoods && criteria.userAffinities.topMoods.length > 0) {
        parts.push(`• Estados de ánimo recurrentes: ${criteria.userAffinities.topMoods.join(', ')}`);
      }
      if (typeof criteria.userAffinities.preferredIntensity === 'number') {
        parts.push(`• Ritmo e intensidad media preferida: ${criteria.userAffinities.preferredIntensity.toFixed(1)}/10`);
      }
      if (criteria.userAffinities.preferredBudget) {
        parts.push(`• Presupuesto orientativo habitual: ${criteria.userAffinities.preferredBudget}`);
      }
      if (criteria.userAffinities.totalSavedExperiences && criteria.userAffinities.totalSavedExperiences > 0) {
        parts.push(`• Fidelidad: ${criteria.userAffinities.totalSavedExperiences} planes guardados en favoritos`);
      }

      if (parts.length > 0) {
        userAffinitiesDirective = `\n🧠 APRENDIZAJE PROGRESIVO ('MOOD INTELLIGENCE' ACTIVO):
El motor de personalización ha aprendido estas preferencias históricas del usuario (${criteria.userAffinities.totalSearches || 1} sesiones):
${parts.join('\n')}
INSTRUCCIÓN OBLIGATORIA: Sin invalidar la elección actual (${criteria.environment}, intensidad ${criteria.intensity}/10), calibra la cadencia de paradas, la cercanía entre puntos y los matices sensoriales de 'matchReason' y 'experienceNarrative' para conectar de forma exquisita con este perfil.`;
      }
    }

    // 4. Modo Sorpréndeme Ahora (1-Tap)
    const surpriseMeDirective = criteria.isSurpriseMe
      ? `\n⚡ MODO "SORPRÉNDEME AHORA (1-TAP)": El usuario ha solicitado una recomendación inmediata sin filtrar. Haz que el PLAN 1: ESENCIAL sea el más vibrante, estimulante y oportuno para la hora actual (${timeStr}) y el estado de la ciudad.`
      : '';

    // 5. Filtro Real Pet-Friendly y Directivas de Compañía (En Familia / Con Niños)
    const isPetFriendly = criteria.company === 'Con mascota';
    const isFamilyGroup = criteria.company === 'En Familia';
    const isWithKids = criteria.company === 'Con Niños';
    const isFamilyOrKids = isFamilyGroup || isWithKids;

    const petDirective = isPetFriendly
      ? `\n🐾 FILTRO REAL PET-FRIENDLY ACTIVADO:
El usuario viaja CON MASCOTA. Es una REGLA INQUEBRANTABLE que todos los lugares y paradas seleccionadas sean 100% aptos para animales:
- Prioriza de forma preferente lugares marcados con "PetFriendly: SÍ (Confirmado)", parques, jardines, paseos y locales con terrazas exteriores.
- Si un local es de interior, debe contar con terraza o admitir expresamente mascotas.
- En la narración y en "matchReason", detalla la idoneidad para la mascota (ej. terraza cómoda, espacio verde amplio, cuenco de agua o paseo tranquilo sin agobios).`
      : '';

    const companyDirective = isFamilyGroup
      ? `\n👨‍👩‍👧‍👦 MODO "EN FAMILIA" (GRUPOS MULTIGENERACIONALES: ADULTOS, ABUELOS Y JÓVENES) ACTIVADO:
Adapta ESTRICTAMENTE la selección de lugares a un grupo familiar diverso:
- Prioriza restaurantes AMPLIOS con mesas cómodas y buena relación calidad-precio.
- Elige paseos accesibles SIN grandes desniveles ni escaleras complicadas, centros culturales interactivos, terrazas tranquilas o miradores con fácil acceso en coche o a pie.
- Garantiza comodidad y ritmo disfrutable para mayores y jóvenes por igual. Detalla en "accessibilityInfo" la facilidad de acceso y recorrido llano.`
      : isWithKids
      ? `\n🧸 MODO "CON NIÑOS" (SEGURIDAD, DINAMISMO Y CERO ESTRÉS PARA PADRES) ACTIVADO:
Adapta ESTRICTAMENTE la selección de lugares para disfrutar con peques:
- Prioriza parques con zonas de juego cercanas, terrazas PEATONALIZADAS o sin tráfico inmediato, cafeterías family-friendly, museos interactivos, rutas cortas de naturaleza o locales con ambiente relajado donde los niños puedan moverse con comodidad.
- PROHIBICIÓN ESTRICTA: Queda TERMINANTEMENTE PROHIBIDO incluir locales nocturnos, bares de copas, coctelerías, discotecas o restaurantes muy estrechos y excesivamente formales.
- En "matchReason" y "experienceNarrative" destaca por qué el plan es seguro, entretenido para los peques y sin estrés para los padres.`
      : '';

    // 6. Directiva de Geofencing Genérica y Concisa
    const geofencingDirective = isEscapadaMode
      ? `\n- MODO ESCAPADA (${targetCity}): prioriza parajes naturales, miradores y entorno próximo a ${targetCity}.`
      : `\n- ÁMBITO LOCAL (${targetCity}): prioriza barrios y rincones auténticos propios de ${targetCity}.`;

    // 7. Directiva de Geolocalización GPS en Tiempo Real
    const gpsDirective = isGpsActive
      ? `\n- GPS ACTIVO (${userLocation.lat.toFixed(5)}, ${userLocation.lng.toFixed(5)}${userLocation.neighborhood ? `, ${userLocation.neighborhood}` : ''}): prioriza paradas cercanas al punto de partida.`
      : '';

    // 8. Directiva de Modo de Experiencia: Ruta Encadenada vs Plan Único
    const experienceMode = criteria.experienceMode || 'chained';
    const isChainedRoute = experienceMode === 'chained';
    const familyWalkingPaceRule = isFamilyOrKids
      ? ` Ritmo pausado (~3 km/h, tramos cortos sin cuestas exigentes, indica "(ritmo pausado)" en walkingTimeFromPrevious).`
      : '';

    const chainedRouteDirective = isChainedRoute
      ? `\n- RUTA ENCADENADA: cada plan debe tener exactamente 3 paradas secuenciales conectadas a pie (<= 15 min entre paradas contiguas).${familyWalkingPaceRule} En "schedule": "order" (1,2,3), "time" ascendente desde ${timeStr}, "activity", "walkingTimeFromPrevious" ("Punto de inicio" en parada 1).`
      : `\n- PLAN ÚNICO: 1 parada principal en ${targetCity} ("order": 1, "walkingTimeFromPrevious": "Punto de inicio").`;

    // 9. Directiva de Filtro "Solo Abiertos Ahora"
    const onlyOpenNow = Boolean(criteria.onlyOpenNow || req.body.onlyOpenNow);
    const openNowDirective = onlyOpenNow
      ? `\n- SOLO ABIERTOS AHORA (${timeStr}): prioriza lugares operativos en la franja ${timePeriodName}.`
      : '';

    // 10. Exclusión inteligente ("Ya estuve aquí") ya filtrada en código sobre effectivePlacesPool y sanitizeSchedule

    // 11. Directiva de Perfil Dinámico de Gustos y Restricciones Manuales (Memoria Silenciosa)
    const userTasteProfile = req.body?.userTasteProfile || criteria.userTasteProfile;
    let tasteProfileDirective = '';
    if (userTasteProfile && typeof userTasteProfile === 'object') {
      const manualRestrictions: string[] = Array.isArray(userTasteProfile.manualRestrictions)
        ? userTasteProfile.manualRestrictions
        : [];
      const recurringPrefs: string[] = Array.isArray(userTasteProfile.recurringPreferences)
        ? userTasteProfile.recurringPreferences
        : [];
      const profileSummary =
        typeof userTasteProfile.summary === 'string' ? userTasteProfile.summary.trim() : '';

      const profileLines: string[] = [];
      if (profileSummary) {
        profileLines.push(`• Resumen del perfil aprendido: ${profileSummary}`);
      }
      if (recurringPrefs.length > 0) {
        profileLines.push(`• Preferencias recurrentes detectadas: ${recurringPrefs.join(', ')}`);
      }
      if (manualRestrictions.length > 0) {
        profileLines.push(
          `• RESTRICCIONES Y REGLAS ACTIVAS DEL USUARIO (OBLIGATORIO CUMPLIR): ${manualRestrictions.join(' | ')}`
        );
      }

      if (profileLines.length > 0) {
        tasteProfileDirective = `\n🎛️ PERFIL DE GUSTOS DEL USUARIO:\n${profileLines.join('\n')}`;
      }
    }

    const prompt = `Eres curador local de experiencias para "TasteLocal Living" en "${targetCity}".
CONTEXTO:
- Ciudad: ${targetCity} (${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}) • Hora: ${timeStr} (${timePeriodName}: ${timeGuidance})
- Estado de ánimo: ${criteria.user_mood}${criteria.user_mood_description ? ` ("${criteria.user_mood_description}")` : ''}
- Entorno: ${criteria.environment} • Tiempo disponible: ${criteria.availableTime || '2-4h'} • Compañía: ${criteria.company}
- Presupuesto: ${criteria.budget || 'Equilibrado / Normal'} • Movilidad: ${criteria.mobility} • Energía: ${criteria.intensity}/10
- Clima: ${
      weather?.isAvailable === false || weather?.alertLevel === 'unavailable'
        ? 'No disponible (propuestas versátiles)'
        : `${weather?.temp ?? 'N/D'}°C, ${weather?.condition || 'Agradable'} (${weather?.summary || ''})`
    }${geofencingDirective}${gpsDirective}${chainedRouteDirective}${openNowDirective}${weatherDirective}${userAffinitiesDirective}${tasteProfileDirective}${surpriseMeDirective}${petDirective}${companyDirective}

LUGARES REALES Y VERIFICADOS EN ${targetCity.toUpperCase()}:
${availablePlacesDescription}

GENERA 3 PROPUESTAS DIFERENCIADAS EN JSON:
1. "badge": "PLAN IDEAL" (encaje directo con emoción, tiempo y compañía)
2. "badge": "PLAN ALTERNATIVO" (misma emoción, enfoque distinto)
3. "badge": "PLAN SORPRESA" (propuesta singular pero realizable)

REQUISITOS DE FORMATO Y VERIFICACIÓN:
- Incluye en cada plan: id, badge, tagline, title, shortDescription, matchReason (2 frases conectando con la emoción), experienceNarrative (3-5 líneas sensoriales), accessibilityInfo, budgetEstimate, energyRequired, approxDuration ("${criteria.availableTime || '2-4h'}"), y schedule.
- REGLA INQUEBRANTABLE: Elige ÚNICAMENTE lugares de "LUGARES REALES Y VERIFICADOS" usando EXACTAMENTE su "placeId" ([ID: "..."]), "placeName" y "placeAddress". Prohibido inventar lugares, coordenadas, horarios o valoraciones.`;

    const response = await callGeminiWithResilience({
      contents: prompt,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          proposals: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                badge: { type: Type.STRING },
                tagline: { type: Type.STRING },
                title: { type: Type.STRING },
                shortDescription: { type: Type.STRING },
                matchReason: { type: Type.STRING },
                experienceNarrative: { type: Type.STRING },
                accessibilityInfo: { type: Type.STRING },
                budgetEstimate: { type: Type.STRING },
                energyRequired: { type: Type.STRING },
                approxDuration: { type: Type.STRING },
                schedule: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      order: { type: Type.INTEGER },
                      time: { type: Type.STRING },
                      activity: { type: Type.STRING },
                      placeName: { type: Type.STRING },
                      placeId: { type: Type.STRING },
                      placeAddress: { type: Type.STRING },
                      walkingTimeFromPrevious: { type: Type.STRING },
                      description: { type: Type.STRING },
                    },
                    required: ['time', 'activity', 'placeName', 'placeId', 'placeAddress'],
                  },
                },
              },
              required: ['id', 'badge', 'title', 'shortDescription', 'matchReason', 'schedule'],
            },
          },
        },
        required: ['proposals'],
      },
    });

    const parsed = JSON.parse(response.text || '{}');

    // Post-generation validation & strict ID verification (ZERO hallucinations)
    const sanitizeSchedule = async (items: Array<Record<string, unknown>>) => {
      if (!Array.isArray(items)) return [];
      const itemPromises = items.map(async (item, idx) => {
        const placeId = String(item.placeId || '').trim();
        const placeName = String(item.placeName || '').trim();

        const verified =
          verifiedById.get(placeId) ||
          verifiedByName.get(placeName.toLowerCase());

        if (!verified) {
          console.warn(
            `[Strict Verification] Descartando lugar no verificado por ID: "${placeName}" (${placeId})`
          );
          return null;
        }

        const rawWalk =
          typeof item.walkingTimeFromPrevious === 'string' && item.walkingTimeFromPrevious.trim()
            ? item.walkingTimeFromPrevious.trim()
            : idx === 0
            ? 'Punto de inicio'
            : isFamilyOrKids
            ? `${9 + idx * 2} min caminando (ritmo pausado)`
            : `${6 + idx * 3} min caminando`;

        const walkingTimeFormatted =
          idx > 0 && isFamilyOrKids && !/pausad|tranquil|familia|peque|inicio/i.test(rawWalk)
            ? `${rawWalk} (ritmo pausado)`
            : rawWalk;

        const baseItem = {
          order: typeof item.order === 'number' ? item.order : idx + 1,
          time: String(item.time || `${10 + idx * 2}:00`),
          activity: String(item.activity || `Visita a ${verified.name}`),
          walkingTimeFromPrevious: walkingTimeFormatted,
          placeId: verified.id,
          placeName: verified.name,
          placeAddress: verified.address,
          location: verified.location,
          rating: verified.rating,
          userRatingsTotal: verified.userRatingsTotal,
          priceLevel: verified.priceLevel,
          isOpenNow: verified.isOpenNow,
          photoUrl: verified.photoUrl,
          types: verified.types,
          phoneNumber: verified.phoneNumber,
          websiteUri: verified.websiteUri,
          allowsDogs: verified.allowsDogs,
          verifiedSource: verified.verifiedSource,
          accessibilityOptions: verified.accessibilityOptions,
          description: typeof item.description === 'string' ? item.description : undefined,
        };

        // Enriquecer con Google Places API si falta foto/horario/rating reales (sin inventar datos)
        const needsEnrichment =
          baseItem.verifiedSource === 'openstreetmap' ||
          (!baseItem.photoUrl && getMapsApiKey() !== '');

        const enriched = needsEnrichment
          ? await enrichPlaceWithGooglePlaces(
              baseItem.placeName,
              baseItem.placeAddress,
              baseItem.location,
              targetCity
            )
          : null;

        return {
          ...baseItem,
          isOpenNow: baseItem.isOpenNow ?? enriched?.isOpenNow,
          rating: baseItem.rating ?? enriched?.rating,
          userRatingsTotal: baseItem.userRatingsTotal ?? enriched?.userRatingsTotal,
          priceLevel: baseItem.priceLevel ?? enriched?.priceLevel,
          photoUrl:
            baseItem.photoUrl ||
            enriched?.photoUrl ||
            getCuratedFallbackPhoto(baseItem.placeName, baseItem.types),
          phoneNumber: baseItem.phoneNumber || enriched?.phoneNumber,
          websiteUri: baseItem.websiteUri || enriched?.websiteUri,
          isLocalSuggestion: false,
        };
      });

      const resolved = await Promise.all(itemPromises);
      let validItems = resolved.filter((i): i is NonNullable<typeof i> => i !== null);

      if (visitedPlaces.length > 0) {
        validItems = validItems.filter(
          (it) => !isPlaceAlreadyVisited(it.placeId, it.placeName)
        );
      }

      if (isWithKids) {
        const kidsSafeItems = validItems.filter((it) => {
          const types = Array.isArray(it.types) ? it.types.map((t: string) => t.toLowerCase()) : [];
          const hasNightType = types.includes('night_club');
          const hasNightName = /discoteca|pub nocturno|night_club|copa|cocteler[ií]a|rooftop/i.test(
            String(it.placeName || '')
          );
          return !hasNightType && !hasNightName;
        });
        if (kidsSafeItems.length > 0) {
          validItems = kidsSafeItems;
        }
      }

      if (onlyOpenNow) {
        validItems = validItems.filter((it) => it.isOpenNow !== false);
      }

      return validItems.map((it, idx) => ({
        ...it,
        order: idx + 1,
      }));
    };

    let rawProposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];

    const sanitizedProposals = (
      await Promise.all(
        rawProposals.slice(0, 3).map(async (prop: Record<string, unknown>, idx: number) => {
          const id = idx === 0 ? 'ideal' : idx === 1 ? 'alternative' : 'surprise';
          const badge = idx === 0 ? 'PLAN IDEAL' : idx === 1 ? 'PLAN ALTERNATIVO' : 'PLAN SORPRESA';
          const tagline =
            idx === 0
              ? 'Encaje directo con tu momento'
              : idx === 1
              ? 'Misma emoción, enfoque distinto'
              : 'Propuesta singular e inesperada';

          const schedule = await sanitizeSchedule(prop.schedule as Array<Record<string, unknown>>);
          if (schedule.length === 0) return null;

          const primaryStop = schedule[0];

          return {
            id,
            badge: String(prop.badge || badge),
            tagline: String(prop.tagline || tagline),
            title: String(prop.title || `Propuesta ${idx + 1}`),
            shortDescription: String(prop.shortDescription || ''),
            matchReason: String(
              prop.matchReason || 'Curado cuidadosamente para sintonizar con tu momento de hoy.'
            ),
            approxDuration: String(prop.approxDuration || criteria.availableTime || '2 a 4 horas'),
            experienceNarrative: String(
              prop.experienceNarrative ||
                `Una experiencia trazada exclusivamente sobre lugares reales verificados en ${targetCity}.`
            ),
            accessibilityInfo: String(prop.accessibilityInfo || 'Acceso verificado según entorno.'),
            budgetEstimate: String(prop.budgetEstimate || criteria.budget || 'Según consumo local'),
            energyRequired: String(prop.energyRequired || `Ritmo ${criteria.intensity}/10`),
            schedule,
            photoUrl: primaryStop?.photoUrl || getCuratedFallbackPhoto(String(prop.title || '')),
            isOpenNow: primaryStop?.isOpenNow,
            rating: primaryStop?.rating,
            userRatingsTotal: primaryStop?.userRatingsTotal,
            priceLevel: primaryStop?.priceLevel,
            isLocalSuggestion: false,
          };
        })
      )
    ).filter((p): p is NonNullable<typeof p> => p !== null);

    // Completar hasta 3 propuestas si faltan usando exclusivamente lugares reales verificados
    if (sanitizedProposals.length === 0) {
      const realFallback = buildVerifiedFallbackItinerary({
        verifiedPlaces: effectivePlacesPool,
        criteria,
        weather: weather || null,
        targetCity,
        searchRadiusKm: searchRadius,
      });
      if (!realFallback) {
        return sendStructuredError(res, 404, {
          code: searchRadius < 15 ? 'NO_VERIFIED_PLACES_IN_RADIUS' : 'NO_VERIFIED_PLACES',
          message:
            searchRadius < 15
              ? `No quedaron suficientes lugares verificados tras aplicar tus filtros en un radio de ${searchRadius} km. Prueba ampliar la búsqueda a 15 km.`
              : 'No quedaron suficientes lugares reales verificados tras aplicar tus filtros en esta zona.',
          retryable: false,
          extra: searchRadius < 15 ? { suggestedRadiusKm: 15 } : undefined,
        });
      }
      return res.json(realFallback);
    }

    let finalProposals = sanitizedProposals;
    if (finalProposals.length < 3) {
      const realFallback = buildVerifiedFallbackItinerary({
        verifiedPlaces: effectivePlacesPool,
        criteria,
        weather: weather || null,
        targetCity,
        searchRadiusKm: searchRadius,
      });
      const fallbackList = (realFallback?.proposals as Array<Record<string, any>>) || [];
      for (const fb of fallbackList) {
        if (finalProposals.length >= 3) break;
        if (!finalProposals.some((p) => p.id === fb.id)) {
          finalProposals.push(fb as any);
        }
      }
    }

    parsed.proposals = finalProposals.map((p: Record<string, unknown>) => ({
      ...p,
      isPlanB: isBadWeather,
    }));
    parsed.mainPlan = parsed.proposals[0];
    parsed.premiumContingencyPlan = {
      ...(parsed.proposals[1] || parsed.proposals[0]),
      reasonForChange: (parsed.proposals[1] || parsed.proposals[0]).matchReason,
    };
    parsed.isGeographicallyOptimized = true;
    parsed.isPlanBActive = isBadWeather;
    parsed.planBReason = isBadWeather
      ? `🌧️ Detectada ${weather?.condition || 'precipitación'} (${weather?.temp ?? 'N/D'}°C). Se han priorizado espacios reales cubiertos y acogedores manteniendo intacta tu intención de "${criteria.user_mood}".`
      : undefined;

    return res.json(parsed);
  } catch (error) {
    const isGeminiTimeout =
      error instanceof GeminiTimeoutError ||
      (error as { code?: string })?.code === 'GEMINI_TIMEOUT' ||
      (error instanceof Error && error.name === 'AbortError');

    console.warn('Error generating itinerary with Gemini, falling back strictly to verified places:', error);
    const verifiedFallback = buildVerifiedFallbackItinerary({
      verifiedPlaces: effectivePoolForFallback,
      criteria: fallbackCriteria,
      weather: fallbackWeather,
      targetCity: fallbackTargetCity,
      searchRadiusKm: fallbackRadiusKm,
    });

    if (verifiedFallback) {
      return res.status(200).json({
        ...verifiedFallback,
        degraded: true,
        fallbackReason: isGeminiTimeout ? 'GEMINI_TIMEOUT' : 'AI_UNAVAILABLE',
      });
    }

    if (isGeminiTimeout) {
      return sendStructuredError(res, 504, {
        code: 'GEMINI_TIMEOUT',
        message: 'La generación narrativa con IA superó el tiempo máximo permitido y no hay lugares verificados disponibles para construir el plan.',
        retryable: true,
      });
    }

    const canExpand = fallbackRadiusKm < 15;
    return sendStructuredError(res, 503, {
      code: 'AI_UNAVAILABLE',
      message: canExpand
        ? `El servicio de personalización con IA no está disponible en este momento y no hay lugares reales previos en un radio de ${fallbackRadiusKm} km. Inténtalo de nuevo o amplía el radio.`
        : 'El servicio de personalización con IA no está disponible en este momento. Inténtalo de nuevo en unos segundos.',
      retryable: true,
      extra: canExpand ? { suggestedRadiusKm: 15 } : undefined,
    });
  }
};

app.post('/api/gemini/generate-itinerary', handleGenerateItinerary);
app.post('/api/generate', handleGenerateItinerary);

// 3. Geocoding endpoint
const handleGeocode = async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query) {
      return sendStructuredError(res, 400, {
        code: 'INVALID_REQUEST',
        message: 'Debes indicar una ciudad, dirección o barrio para buscar.',
        retryable: false,
      });
    }

    const apiKey = getMapsApiKey();
    if (apiKey) {
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          query
        )}&key=${apiKey}&language=es`;
        const gRes = await fetch(url);
        const data = await gRes.json();
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const loc = data.results[0].geometry.location;
          return res.json({
            location: { lat: loc.lat, lng: loc.lng },
            formattedAddress: data.results[0].formatted_address,
          });
        }
      } catch (gErr) {
        console.warn('Google geocoding error, trying fallback:', gErr);
      }
    }

    // Fallback A: OpenStreetMap Nominatim
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        query
      )}&format=json&limit=1`;
      const nomRes = await fetch(nomUrl, {
        headers: { 'User-Agent': 'TasteLocalLiving/1.0 (contact: info@tastelocal.app)' },
      });
      if (nomRes.ok && nomRes.headers.get('content-type')?.includes('application/json')) {
        const nomData = (await nomRes.json()) as Array<{
          lat: string;
          lon: string;
          display_name: string;
        }>;
        if (nomData && nomData.length > 0) {
          return res.json({
            location: {
              lat: parseFloat(nomData[0].lat),
              lng: parseFloat(nomData[0].lon),
            },
            formattedAddress: nomData[0].display_name,
          });
        }
      }
    } catch (nomErr) {
      console.warn('Nominatim fallback failed, trying Open-Meteo geocoding:', nomErr);
    }

    // Fallback B: Open-Meteo Geocoding API (robust, highly available, free, no rate-limiting)
    try {
      const omUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        query
      )}&count=1&language=es&format=json`;
      const omRes = await fetch(omUrl);
      if (omRes.ok) {
        const omData = await omRes.json();
        if (omData.results && omData.results.length > 0) {
          const item = omData.results[0];
          const addressParts = [item.name, item.admin1, item.country].filter(Boolean);
          return res.json({
            location: {
              lat: item.latitude,
              lng: item.longitude,
            },
            formattedAddress: addressParts.join(', '),
          });
        }
      }
    } catch (omErr) {
      console.warn('Open-Meteo geocoding failed:', omErr);
    }

    return sendStructuredError(res, 404, {
      code: 'NOT_FOUND',
      message: 'No pudimos encontrar esa ubicación. Prueba con el nombre de la ciudad o un código postal.',
      retryable: false,
    });
  } catch (error) {
    console.error('Geocoding endpoint error:', error);
    return sendStructuredError(res, 500, {
      code: 'INTERNAL_ERROR',
      message: 'Error al geolocalizar la dirección.',
      retryable: true,
    });
  }
};

app.post('/api/places/geocode', handleGeocode);
app.post('/api/geocode', handleGeocode);

// 3.1 Reverse Geocoding endpoint (Native GPS to Town & Neighborhood)
const handleReverseGeocode = async (req: Request, res: Response) => {
  try {
    const lat = Number(req.body.lat ?? req.body.latitude);
    const lng = Number(req.body.lng ?? req.body.longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return sendStructuredError(res, 400, {
        code: 'INVALID_REQUEST',
        message: 'Se requieren coordenadas válidas de latitud y longitud.',
        retryable: false,
      });
    }

    const apiKey = getMapsApiKey();
    if (apiKey) {
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=es`;
        const gRes = await fetch(url);
        const data = await gRes.json();
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          const result = data.results[0];
          let cityName = '';
          let neighborhood = '';

          for (const comp of result.address_components || []) {
            if (comp.types.includes('locality')) {
              cityName = comp.long_name;
            } else if (!cityName && (comp.types.includes('postal_town') || comp.types.includes('administrative_area_level_2'))) {
              cityName = comp.long_name;
            }
            if (comp.types.includes('sublocality') || comp.types.includes('neighborhood')) {
              neighborhood = comp.long_name;
            }
          }

          return res.json({
            cityName: cityName || 'Tu ubicación',
            neighborhood: neighborhood || undefined,
            formattedAddress: result.formatted_address,
            location: {
              lat,
              lng,
              cityName: cityName || 'Tu ubicación',
              formattedAddress: result.formatted_address,
              neighborhood: neighborhood || undefined,
              isGps: true,
            },
          });
        }
      } catch (gErr) {
        console.warn('Google reverse geocode error, trying OSM fallback:', gErr);
      }
    }

    // Fallback A: OpenStreetMap Nominatim Reverse
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`;
      const nomRes = await fetch(nomUrl, {
        headers: { 'User-Agent': 'TasteLocalLiving/1.0 (contact: info@tastelocal.app)' },
      });
      if (nomRes.ok) {
        const nomData = await nomRes.json();
        const addr = nomData.address || {};
        const cityName = addr.city || addr.town || addr.village || addr.municipality || addr.county || 'Tu zona';
        const neighborhood = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district;

        return res.json({
          cityName,
          neighborhood: neighborhood || undefined,
          formattedAddress: nomData.display_name,
          location: {
            lat,
            lng,
            cityName,
            formattedAddress: nomData.display_name,
            neighborhood: neighborhood || undefined,
            isGps: true,
          },
        });
      }
    } catch (nomErr) {
      console.warn('Nominatim reverse geocode failed:', nomErr);
    }

    // Fallback B: Heuristic coordinates
    return res.json({
      cityName: 'Tu ubicación GPS',
      formattedAddress: `Coordenadas: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      location: {
        lat,
        lng,
        cityName: 'Tu ubicación GPS',
        formattedAddress: `Coordenadas: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        isGps: true,
      },
    });
  } catch (error) {
    console.error('Reverse geocode unexpected error:', error);
    return sendStructuredError(res, 500, {
      code: 'INTERNAL_ERROR',
      message: 'Error al procesar geocodificación inversa.',
      retryable: true,
    });
  }
};

app.post('/api/geocode/reverse', handleReverseGeocode);
app.post('/api/places/reverse-geocode', handleReverseGeocode);

// 4. Places Search endpoint (Google Places API New + OpenStreetMap Overpass, ZERO Gemini fabrication)
const handlePlacesSearch = async (req: Request, res: Response) => {
  try {
    const { query, location, searchRadiusKm, radiusKm } = req.body || {};

    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      return sendStructuredError(res, 400, {
        code: 'INVALID_REQUEST',
        message: 'Se requiere una ubicación válida { lat, lng } para buscar lugares.',
        retryable: false,
      });
    }

    const effectiveRadiusKm = Math.min(
      50,
      Math.max(1, Number(searchRadiusKm || radiusKm || location.searchRadiusKm || 5))
    );

    const searchResult = await searchVerifiedPlacesInArea({
      query: String(query || 'lugares de interés'),
      lat: location.lat,
      lng: location.lng,
      radiusKm: effectiveRadiusKm,
    });

    res.setHeader('X-Cache', searchResult.cacheHit ? 'HIT' : 'MISS');

    if (searchResult.sourceFailed && searchResult.places.length === 0) {
      return sendStructuredError(res, 503, {
        code: 'MAPS_UNAVAILABLE',
        message:
          'Los servicios de mapas y búsqueda de lugares reales no están disponibles en este momento.',
        retryable: true,
      });
    }

    return res.json({
      places: searchResult.places,
      meta: {
        radiusKm: effectiveRadiusKm,
        totalFound: searchResult.places.length,
      },
    });
  } catch (error) {
    console.error('Places search endpoint unexpected error:', error);
    return sendStructuredError(res, 500, {
      code: 'INTERNAL_ERROR',
      message: 'Error inesperado al consultar lugares verificados.',
      retryable: true,
    });
  }
};

app.post('/api/places/search', handlePlacesSearch);
app.post('/api/places', handlePlacesSearch);

// 5. Routes API endpoint
app.post('/api/routes/compute', async (req: Request, res: Response) => {
  try {
    const { origin, destination, travelMode } = req.body;
    const apiKey = getMapsApiKey();

    if (!origin || !destination) {
      return sendStructuredError(res, 400, {
        code: 'INVALID_REQUEST',
        message: 'Se requieren las coordenadas de origen y destino para calcular la ruta.',
        retryable: false,
      });
    }

    let gMode = 'WALK';
    if (travelMode === 'DRIVING') gMode = 'DRIVE';
    else if (travelMode === 'TRANSIT') gMode = 'TRANSIT';
    else if (travelMode === 'BICYCLING') gMode = 'BICYCLE';

    if (apiKey) {
      try {
        const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';
        const body = {
          origin: {
            location: {
              latLng: { latitude: origin.lat, longitude: origin.lng },
            },
          },
          destination: {
            location: {
              latLng: { latitude: destination.lat, longitude: destination.lng },
            },
          },
          travelMode: gMode,
          languageCode: 'es',
          units: 'METRIC',
        };

        const gRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask':
              'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
          },
          body: JSON.stringify(body),
        });

        const data = await gRes.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const seconds = parseInt(route.duration?.replace('s', '') || '600', 10);
          const minutes = Math.max(1, Math.round(seconds / 60));
          const meters = route.distanceMeters || 1000;
          const distanceStr = meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;

          return res.json({
            duration: `${minutes} min`,
            distance: distanceStr,
            travelMode,
            encodedPolyline: route.polyline?.encodedPolyline || '',
            suggestedPois: [],
          });
        }
      } catch (gErr) {
        console.warn('Google Routes API computeRoutes error:', gErr);
      }
    }

    // Mathematical approximation for distance and duration
    const latDiff = (destination.lat - origin.lat) * 111;
    const lngDiff = (destination.lng - origin.lng) * 85;
    const distKm = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
    const speedKmH = travelMode === 'WALKING' ? 4.5 : travelMode === 'BICYCLING' ? 14 : 30;
    const approxMin = Math.max(4, Math.round((distKm / speedKmH) * 60));

    return res.json({
      duration: `${approxMin} min aprox.`,
      distance: `${distKm.toFixed(1)} km`,
      travelMode,
      encodedPolyline: '',
      suggestedPois: [],
    });
  } catch (error) {
    console.error('Routes compute endpoint error:', error);
    return sendStructuredError(res, 500, {
      code: 'INTERNAL_ERROR',
      message: 'Error al calcular la ruta.',
      retryable: true,
    });
  }
});

// 6. Weather endpoint with OpenWeather support and graceful degradation
app.post('/api/weather', async (req: Request, res: Response) => {
  try {
    const { location } = req.body;
    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      return res.json({
        temp: null,
        condition: 'No disponible',
        description: 'Ubicación no especificada',
        icon: '⛅',
        alertLevel: 'unavailable',
        summary: 'Datos meteorológicos no disponibles.',
        isAvailable: false,
      });
    }

    const { lat, lng } = location;

    const wCacheKey = `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
    const cachedWeather = weatherCache.get(wCacheKey);
    if (cachedWeather) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cachedWeather);
    }
    res.setHeader('X-Cache', 'MISS');

    // A) If OpenWeather API key is configured, query OpenWeatherMap
    const openWeatherKey = process.env.OPENWEATHER_API_KEY;
    if (openWeatherKey && openWeatherKey.trim() !== '') {
      try {
        const owUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${openWeatherKey}&units=metric&lang=es`;
        const owRes = await fetch(owUrl);
        if (owRes.ok) {
          const owData = await owRes.json();
          const temp = Math.round(owData.main?.temp ?? 20);
          const condition = owData.weather?.[0]?.description || 'Agradable';
          const mainCondition = owData.weather?.[0]?.main?.toLowerCase() || '';

          let alertLevel: 'clear' | 'warning' | 'severe' = 'clear';
          let icon = '☀️';
          if (mainCondition.includes('rain') || mainCondition.includes('drizzle')) {
            alertLevel = 'warning';
            icon = '🌧️';
          } else if (mainCondition.includes('thunderstorm')) {
            alertLevel = 'severe';
            icon = '⛈️';
          } else if (mainCondition.includes('snow')) {
            alertLevel = 'warning';
            icon = '❄️';
          } else if (mainCondition.includes('cloud')) {
            icon = '🌤️';
          }

          let summary = `Temperatura de ${temp}°C con cielo ${condition}.`;
          if (alertLevel === 'severe') {
            summary = `Aviso por tormenta o lluvia intensa (${temp}°C). Se aconsejan planes a cubierto.`;
          } else if (alertLevel === 'warning') {
            summary = `Probabilidad de lluvia (${temp}°C). Recomendable llevar paraguas.`;
          }

          const weatherPayload = {
            temp,
            condition,
            description: condition,
            icon,
            alertLevel,
            summary,
            isAvailable: true,
            isRainy: alertLevel !== 'clear',
            isHot: temp > 30,
          };
          weatherCache.set(wCacheKey, weatherPayload);
          return res.json(weatherPayload);
        }
      } catch (owErr) {
        console.warn('OpenWeather request failed, falling back to Open-Meteo:', owErr);
      }
    }

    // B) Query Open-Meteo free meteorological API
    try {
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;
      const wRes = await fetch(weatherUrl);
      if (wRes.ok) {
        const wData = await wRes.json();
        if (wData && wData.current) {
          const cur = wData.current;
          const temp = Math.round(cur.temperature_2m);
          const code = cur.weather_code;
          const precipitation = cur.precipitation || 0;

          let condition = 'Despejado';
          let icon = '☀️';
          let alertLevel: 'clear' | 'warning' | 'severe' = 'clear';

          if (code === 0) {
            condition = 'Despejado';
            icon = '☀️';
          } else if (code >= 1 && code <= 3) {
            condition = 'Parcialmente nublado';
            icon = '🌤️';
          } else if (code >= 45 && code <= 48) {
            condition = 'Niebla';
            icon = '🌫️';
            alertLevel = 'warning';
          } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
            condition = 'Lluvia';
            icon = '🌧️';
            alertLevel = precipitation > 4 ? 'severe' : 'warning';
          } else if (code >= 71 && code <= 77) {
            condition = 'Nieve';
            icon = '❄️';
            alertLevel = 'warning';
          } else if (code >= 95) {
            condition = 'Tormenta';
            icon = '⛈️';
            alertLevel = 'severe';
          }

          let summary = `Temperatura agradable de ${temp}°C para recorrer la ciudad.`;
          if (alertLevel === 'severe') {
            summary = `Aviso por mal tiempo (${temp}°C). Se priorizarán actividades protegidas.`;
          } else if (alertLevel === 'warning') {
            summary = `Posibilidad de lluvia (${temp}°C). Recomendable llevar paraguas.`;
          }

          const weatherPayload = {
            temp,
            condition,
            description: condition,
            icon,
            alertLevel,
            summary,
            isAvailable: true,
            isRainy: alertLevel !== 'clear',
            isHot: temp > 30,
          };
          weatherCache.set(wCacheKey, weatherPayload);
          return res.json(weatherPayload);
        }
      }
    } catch (omErr) {
      console.warn('Open-Meteo request failed:', omErr);
    }

    // C) Elegant fallback if no weather service responds: inform that weather is unavailable
    return res.json({
      temp: null,
      condition: 'No disponible',
      description: 'El tiempo no está disponible en este momento',
      icon: '⛅',
      alertLevel: 'unavailable',
      summary: 'Información meteorológica no disponible. Puedes disfrutar de tu itinerario normalmente.',
      isAvailable: false,
      isRainy: false,
      isHot: false,
    });
  } catch (error) {
    console.error('Weather endpoint unexpected error:', error);
    return res.json({
      temp: null,
      condition: 'No disponible',
      description: 'Tiempo no disponible',
      icon: '⛅',
      alertLevel: 'unavailable',
      summary: 'Información meteorológica no disponible.',
      isAvailable: false,
      isRainy: false,
      isHot: false,
    });
  }
});

// 7. FASE 7: Modo Pareja / Grupo — Mazo de hasta 5 propuestas reales verificadas + Sesiones compartidas sin registro
const groupSessionsStore = new Map<string, Record<string, any>>();

app.post('/api/group/deck', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    const lat = Number(body.latitude ?? body.location?.lat);
    const lng = Number(body.longitude ?? body.location?.lng);
    if (isNaN(lat) || isNaN(lng)) {
      return sendStructuredError(res, 400, {
        code: 'INVALID_REQUEST',
        message: 'Se requieren coordenadas válidas para buscar propuestas reales de grupo.',
        retryable: false,
      });
    }

    const searchRadius = Math.min(
      50,
      Math.max(1, Number(body.searchRadiusKm || (body.environment === 'Escapada' ? 15 : 5)))
    );

    const targetCity =
      String(
        body.cityName ||
          body.location?.cityName ||
          (typeof body.location?.formattedAddress === 'string'
            ? body.location.formattedAddress.split(',')[0].trim()
            : '') ||
          'tu ciudad'
      ).trim();

    const rawVisited = Array.isArray(body.visitedPlaces) ? body.visitedPlaces : [];
    const visitedIdSet = new Set(
      rawVisited.map((vp: any) => String(vp?.id || '').toLowerCase().trim()).filter(Boolean)
    );
    const visitedNameSet = new Set(
      rawVisited.map((vp: any) => String(vp?.name || '').toLowerCase().trim()).filter(Boolean)
    );
    const visitedNamesList: string[] = rawVisited
      .map((vp: any) => (typeof vp?.name === 'string' ? vp.name.trim() : ''))
      .filter(Boolean);

    // 1. Obtener únicamente lugares reales verificados en el radio indicado
    const groupQueries = [
      `cafe restaurante tapas cultura parque ${targetCity}`,
      `mirador bistro libreria galeria ${targetCity}`,
    ];
    const verifiedPool: VerifiedPlace[] = [];
    const seenIds = new Set<string>();
    let anySourceOk = false;

    for (const q of groupQueries) {
      const searchRes = await searchVerifiedPlacesInArea({
        query: q,
        lat,
        lng,
        radiusKm: searchRadius,
      });
      if (!searchRes.sourceFailed) anySourceOk = true;
      for (const vp of searchRes.places) {
        if (seenIds.has(vp.id)) continue;
        seenIds.add(vp.id);
        const normId = vp.id.toLowerCase().trim();
        const normName = vp.name.toLowerCase().trim();
        if (!visitedIdSet.has(normId) && !visitedNameSet.has(normName)) {
          verifiedPool.push(vp);
        }
      }
      if (verifiedPool.length >= 12) break;
    }

    if (!anySourceOk && verifiedPool.length === 0) {
      return sendStructuredError(res, 503, {
        code: 'MAPS_UNAVAILABLE',
        message: 'No pudimos conectar con los servicios de mapas para cargar lugares reales.',
        retryable: true,
      });
    }

    if (verifiedPool.length === 0) {
      const canExpand = searchRadius < 15;
      return sendStructuredError(res, 404, {
        code: canExpand ? 'NO_VERIFIED_PLACES_IN_RADIUS' : 'NO_VERIFIED_PLACES',
        message: canExpand
          ? `No encontramos lugares reales verificados en un radio de ${searchRadius} km alrededor de ${targetCity}. Amplía el radio a 15 km para descubrir opciones cercanas.`
          : `No encontramos lugares reales verificados disponibles en ${targetCity} con tus preferencias actuales.`,
        retryable: false,
        extra: canExpand ? { suggestedRadiusKm: 15 } : undefined,
      });
    }

    const poolById = new Map(verifiedPool.map((p) => [p.id, p]));
    const poolByName = new Map(verifiedPool.map((p) => [p.name.toLowerCase().trim(), p]));

    const userTasteProfile = body.userTasteProfile;
    const manualRestrictions: string[] = Array.isArray(userTasteProfile?.manualRestrictions)
      ? userTasteProfile.manualRestrictions
      : [];

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const placesCatalog = verifiedPool
      .map(
        (p) =>
          `[ID: "${p.id}"] Nombre: "${p.name}", Dirección: "${p.address}", Tipos: ${(p.types || []).join(', ') || 'lugar'}, Rating: ${p.rating ?? 'N/D'}`
      )
      .join('\n');

    const prompt = `Eres el curador hiperlocal de "TasteLocal Living" para el modo "Decidir juntos (Pareja / Grupo)".
Selecciona hasta 5 lugares VARIADOS de la lista de lugares reales verificados en "${targetCity}" (radio ${searchRadius} km) para que dos personas o un grupo puedan votar.

LUGARES REALES VERIFICADOS DISPONIBLES:
${placesCatalog}

REGLAS ESTRICTAS:
1. Cada carta DEBE referenciar EXACTAMENTE un [ID: "..."] de la lista superior mediante el campo "placeId". QUEDA TERMINANTEMENTE PROHIBIDO inventar lugares, nombres o coordenadas.
2. Hora actual: ${timeStr}. ${body.onlyOpenNow ? 'Prioriza los sitios abiertos ahora.' : ''}
${body.mood ? `- Estado de ánimo orientativo: ${body.mood}` : ''}
${body.environment ? `- Entorno orientativo: ${body.environment}` : ''}
${body.budget ? `- Presupuesto orientativo: ${body.budget}` : ''}
${visitedNamesList.length > 0 ? `- Excluidos ("Ya estuve aquí"): ${visitedNamesList.join(', ')}.` : ''}
${manualRestrictions.length > 0 ? `- Restricciones del perfil a respetar: ${manualRestrictions.join(' | ')}.` : ''}

Responde en JSON con "cards" conteniendo hasta 5 objetos con:
- placeId: ID exacto de la lista superior
- title: Título atractivo y breve (max 6 palabras)
- neighborhood: Barrio o zona deducida de la dirección
- ambience: Uno de "Calmo / Relajado", "Concurrido / Con ambiente" o "Íntimo y acogedor"
- categoryTag: Categoría breve (ej. "Gastronomía", "Café de autor", "Cultura", "Aire libre", "Coctelería")
- shortDescription: 1 o 2 frases evocadoras del plan (max 140 caracteres)
- matchReason: Por qué es gran plan para compartir en pareja o grupo`;

    let selectedEntries: Array<{ verified: VerifiedPlace; aiMeta: Record<string, any> }> = [];
    try {
      const response = await callGeminiWithResilience({
        contents: prompt,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  placeId: { type: Type.STRING },
                  title: { type: Type.STRING },
                  neighborhood: { type: Type.STRING },
                  ambience: { type: Type.STRING },
                  categoryTag: { type: Type.STRING },
                  shortDescription: { type: Type.STRING },
                  matchReason: { type: Type.STRING },
                },
                required: ['placeId', 'title', 'ambience', 'categoryTag', 'shortDescription'],
              },
            },
          },
          required: ['cards'],
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      const usedIds = new Set<string>();
      if (Array.isArray(parsed.cards)) {
        for (const c of parsed.cards) {
          const vp =
            poolById.get(String(c.placeId || '').trim()) ||
            poolByName.get(String(c.placeName || '').toLowerCase().trim());
          if (vp && !usedIds.has(vp.id)) {
            usedIds.add(vp.id);
            selectedEntries.push({ verified: vp, aiMeta: c });
          }
          if (selectedEntries.length >= 5) break;
        }
      }
    } catch (gemErr) {
      console.warn('[Group Deck] Gemini no disponible, armando mazo directamente con lugares reales verificados:', (gemErr as Error)?.message || gemErr);
    }

    // Completar hasta 5 cartas (o el máximo disponible) usando ÚNICAMENTE lugares reales de verifiedPool
    const usedIds = new Set(selectedEntries.map((e) => e.verified.id));
    for (const vp of verifiedPool) {
      if (selectedEntries.length >= 5) break;
      if (!usedIds.has(vp.id)) {
        usedIds.add(vp.id);
        selectedEntries.push({
          verified: vp,
          aiMeta: {
            title: vp.name,
            neighborhood: targetCity,
            ambience: 'Calmo / Relajado',
            categoryTag: (vp.types && vp.types[0]) || 'Lugar local',
            shortDescription: `Espacio real verificado en ${vp.address}.`,
            matchReason: `Propuesta real verificada en tu radio de ${searchRadius} km.`,
          },
        });
      }
    }

    const enrichedDeck = await Promise.all(
      selectedEntries.slice(0, 5).map(async ({ verified, aiMeta }) => {
        const needsEnrich =
          verified.verifiedSource === 'openstreetmap' ||
          (!verified.photoUrl && getMapsApiKey() !== '');
        const enriched = needsEnrich
          ? await enrichPlaceWithGooglePlaces(verified.name, verified.address, verified.location, targetCity)
          : null;

        return {
          id: verified.id,
          title: String(aiMeta.title || verified.name),
          placeName: verified.name,
          placeAddress: verified.address,
          neighborhood: String(aiMeta.neighborhood || targetCity),
          ambience: String(aiMeta.ambience || 'Calmo / Relajado'),
          categoryTag: String(aiMeta.categoryTag || (verified.types?.[0] || 'Local')),
          priceLevel: verified.priceLevel ?? enriched?.priceLevel,
          isOpenNow: verified.isOpenNow ?? enriched?.isOpenNow,
          rating: verified.rating ?? enriched?.rating,
          userRatingsTotal: verified.userRatingsTotal ?? enriched?.userRatingsTotal,
          photoUrl:
            verified.photoUrl ||
            enriched?.photoUrl ||
            getCuratedFallbackPhoto(`${aiMeta.categoryTag || ''} ${verified.name}`, verified.types),
          shortDescription: String(aiMeta.shortDescription || `Ubicado en ${verified.address}.`),
          matchReason: aiMeta.matchReason ? String(aiMeta.matchReason) : undefined,
          location: verified.location,
          verifiedSource: verified.verifiedSource,
          isLocalSuggestion: false,
        };
      })
    );

    return res.json({ deck: enrichedDeck, cityName: targetCity });
  } catch (error) {
    console.error('Error generating group swipe deck:', error);
    return sendStructuredError(res, 500, {
      code: 'INTERNAL_ERROR',
      message: 'No pudimos preparar las propuestas de grupo en este momento. Inténtalo de nuevo.',
      retryable: true,
    });
  }
});

app.post('/api/group/session', (req: Request, res: Response) => {
  try {
    const session = req.body;
    if (!session || !Array.isArray(session.deck) || session.deck.length === 0) {
      return sendStructuredError(res, 400, {
        code: 'INVALID_REQUEST',
        message: 'Se requiere un mazo válido para guardar la sesión compartida.',
        retryable: false,
      });
    }
    const sessionId =
      typeof session.sessionId === 'string' && session.sessionId.trim()
        ? session.sessionId.trim()
        : `tl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    if (groupSessionsStore.size >= 400) {
      const oldestKey = groupSessionsStore.keys().next().value;
      if (oldestKey) groupSessionsStore.delete(oldestKey);
    }

    groupSessionsStore.set(sessionId, {
      ...session,
      sessionId,
      createdAt: session.createdAt || new Date().toISOString(),
    });

    return res.json({ sessionId });
  } catch (error) {
    console.error('Error saving group session:', error);
    return sendStructuredError(res, 500, {
      code: 'INTERNAL_ERROR',
      message: 'No se pudo guardar la sesión compartida.',
      retryable: true,
    });
  }
});

app.get('/api/group/session/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const stored = groupSessionsStore.get(sessionId);
  if (!stored) {
    return sendStructuredError(res, 404, {
      code: 'NOT_FOUND',
      message: 'La sesión compartida no existe o ha expirado.',
      retryable: false,
    });
  }
  return res.json({ session: stored });
});

// Configure Vite integration for full-stack dev server or static in prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TasteLocal Living server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
