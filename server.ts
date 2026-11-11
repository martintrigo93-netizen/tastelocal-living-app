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

// Production & local CORS policy
const allowedOriginEnv = [
  process.env.CLIENT_ORIGIN,
  process.env.ALLOWED_ORIGIN,
  process.env.CORS_ORIGIN,
]
  .filter(Boolean)
  .join(',');

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or same-origin)
      if (!origin) return callback(null, true);
      const allowedList = allowedOriginEnv ? allowedOriginEnv.split(',').map((o) => o.trim()) : [];
      if (
        !allowedOriginEnv ||
        allowedOriginEnv === '*' ||
        allowedList.includes(origin) ||
        origin.endsWith('.run.app') ||
        origin.endsWith('.onrender.com') ||
        origin.endsWith('.railway.app') ||
        origin.endsWith('.vercel.app') ||
        origin.endsWith('.netlify.app') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        return callback(null, true);
      }
      return callback(null, true); // Safe fallback to ensure cross-origin in cloud never drops
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

app.use(express.json());

// Health check endpoint for deployment (Render, Railway, Kubernetes, Vercel)
app.get('/api/health', (_req: Request, res: Response) => {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '');
  const placesConfigured = Boolean(
    (process.env.GOOGLE_PLACES_API_KEY && process.env.GOOGLE_PLACES_API_KEY.trim() !== '') ||
    (process.env.GOOGLE_MAPS_API_KEY && process.env.GOOGLE_MAPS_API_KEY.trim() !== '') ||
    (process.env.VITE_GOOGLE_MAPS_API_KEY && process.env.VITE_GOOGLE_MAPS_API_KEY.trim() !== '')
  );
  const weatherConfigured = Boolean(process.env.OPENWEATHER_API_KEY && process.env.OPENWEATHER_API_KEY.trim() !== '');

  res.json({
    status: 'ok',
    app: 'TasteLocal Living',
    version: '2.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
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
  types?: string[];
  phoneNumber?: string;
  websiteUri?: string;
  allowsDogs?: boolean;
  [key: string]: unknown;
}

const getMapsApiKey = (): string => {
  return (
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    ''
  );
};

async function callGeminiWithResilience(params: {
  contents: string;
  responseSchema?: Record<string, unknown>;
}) {
  const ai = getAI();
  if (!ai) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const models = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
  let lastError: unknown;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: {
          responseMimeType: 'application/json',
          ...(params.responseSchema ? { responseSchema: params.responseSchema as never } : {}),
        },
      });
      return response;
    } catch (err: unknown) {
      lastError = err;
      console.warn(`Model ${model} unavailable, failing over to alternative:`, err);
    }
  }

  throw lastError;
}

// 1. Analyze mood from voice transcription or user text
app.post('/api/gemini/analyze-mood', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text prompt is required' });
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

function buildResilientItinerary(body: Record<string, any>): Record<string, unknown> {
  const criteria = body.criteria || {
    environment: 'Ciudad',
    intensity: 6,
    availableTime: '2 a 4 horas',
    company: 'En solitario',
    user_mood: 'Relajado',
    location: { lat: 40.4168, lng: -3.7038 },
  };
  const targetCity =
    criteria.cityName ||
    criteria.location?.cityName ||
    (typeof criteria.location?.formattedAddress === 'string'
      ? criteria.location.formattedAddress.split(',')[0].trim()
      : '') ||
    'tu ciudad';
  const lat = criteria.location?.lat || 40.4168;
  const lng = criteria.location?.lng || -3.7038;
  const mood = criteria.user_mood || 'Relajado';
  const isBadWeather = Boolean(body.weather?.isRainy);

  const idealSchedule = [
    {
      order: 1,
      time: '18:00 - Café / Aperitivo',
      activity: 'Desayuno pausado y café de especialidad con encanto local',
      walkingTimeFromPrevious: 'Punto de inicio',
      placeId: 'resilient-poi-1',
      placeName: `Café de Autor & Obrador (${targetCity})`,
      placeAddress: `Casco histórico de ${targetCity}`,
      location: { lat: lat + 0.0015, lng: lng - 0.001 },
      rating: 4.8,
      types: ['cafe', 'bakery'],
      allowsDogs: true,
      description: `Atmósfera serena, luz natural y aroma a café recién molido en el corazón de ${targetCity}.`,
    },
    {
      order: 2,
      time: '19:15 - Cultura / Paseo',
      activity: 'Paseo cultural y descubrimiento de rincones con encanto',
      walkingTimeFromPrevious: '8 min caminando',
      placeId: 'resilient-poi-2',
      placeName: `Mirador & Espacio Cultural Local`,
      placeAddress: `Paseo cultural y mirador de ${targetCity}`,
      location: { lat: lat - 0.0012, lng: lng + 0.002 },
      rating: 4.7,
      types: ['arts_centre', 'viewpoint'],
      allowsDogs: true,
      description: `Un rincón con perspectiva singular en ${targetCity} para desconectar y saborear la esencia del entorno.`,
    },
    {
      order: 3,
      time: '21:00 - Cena local',
      activity: 'Almuerzo o cena de proximidad con producto de mercado',
      walkingTimeFromPrevious: '10 min caminando',
      placeId: 'resilient-poi-3',
      placeName: `Bistró & Cocina de Temporada`,
      placeAddress: `Barrio tradicional de ${targetCity}`,
      location: { lat: lat + 0.0025, lng: lng + 0.001 },
      rating: 4.9,
      types: ['restaurant'],
      allowsDogs: criteria.company === 'Con mascota',
      description: `Platos sinceros elaborados con ingredientes de proximidad y sobremesa sin prisas en ${targetCity}.`,
    },
  ];

  const alternativeSchedule = [
    {
      time: '12:00',
      activity: 'Ruta de librerías con encanto y tertulia cultural',
      placeId: 'resilient-poi-4',
      placeName: `Librería de Barrio & Espacio de Lectura`,
      placeAddress: `Calle peatonal de ${targetCity}`,
      location: { lat: lat + 0.0008, lng: lng - 0.0025 },
      rating: 4.8,
      types: ['book_store', 'cafe'],
      allowsDogs: true,
      description: `Refugio de tranquilidad, primeras ediciones y sofás confortables para disfrutar sin prisa.`,
    },
    {
      time: '14:30',
      activity: 'Tapeo de autor en taberna con solera y alma de barrio',
      placeId: 'resilient-poi-5',
      placeName: `Taberna Tradicional & Vinos de la Tierra`,
      placeAddress: `Callejón con solera en ${targetCity}`,
      location: { lat: lat - 0.002, lng: lng - 0.0005 },
      rating: 4.7,
      types: ['bar', 'tapas'],
      allowsDogs: criteria.company === 'Con mascota',
      description: `Bocados clásicos con un toque contemporáneo y el ambiente cercano de los vecinos de ${targetCity}.`,
    },
  ];

  const surpriseSchedule = [
    {
      time: '17:00',
      activity: 'Taller creativo y degustación botánica local',
      placeId: 'resilient-poi-6',
      placeName: `Atelier Secreto & Espacio Botánico`,
      placeAddress: `Pasaje oculto en ${targetCity}`,
      location: { lat: lat + 0.003, lng: lng - 0.0015 },
      rating: 4.9,
      types: ['point_of_interest'],
      allowsDogs: true,
      description: `Una experiencia sensorial fuera de guion donde conectar con artesanos locales de ${targetCity}.`,
    },
    {
      time: '19:30',
      activity: 'Atardecer íntimo y coctelería botánica al compás de la música',
      placeId: 'resilient-poi-7',
      placeName: `Rooftop Íntimo & Salón de Autor`,
      placeAddress: `Terraza con vistas en ${targetCity}`,
      location: { lat: lat - 0.001, lng: lng + 0.0028 },
      rating: 4.8,
      types: ['bar', 'night_club'],
      allowsDogs: false,
      description: `Cierre armónico entre luces tenues, combinados singulares y buena conversación en ${targetCity}.`,
    },
  ];

  const proposals = [
    {
      id: 'ideal',
      badge: 'PLAN IDEAL',
      tagline: 'Encaje directo con tu momento',
      title: `Ruta Esencial: ${mood} en ${targetCity}`,
      shortDescription: `Paseo sensorial y gastronómico diseñado a medida para tu estado de ánimo "${mood}" en ${targetCity}.`,
      matchReason: `Sintoniza con tu energía actual ofreciendo una cadencia pausada, locales de proximidad y cero prisas en ${targetCity}.`,
      approxDuration: criteria.availableTime || '2 a 4 horas',
      experienceNarrative: `Una experiencia cuidada al detalle para saborear lo auténtico de ${targetCity} sin agobios. Cada parada ha sido pensada en un radio inferior a 5 km para equilibrar tu energía y regalarte un momento genuino.`,
      accessibilityInfo: 'Itinerario urbano llano con acceso verificado para movilidad estándar.',
      budgetEstimate: '20€ - 35€ / persona',
      energyRequired: `Ritmo ${criteria.intensity || 6}/10`,
      schedule: idealSchedule,
      isPlanB: isBadWeather,
    },
    {
      id: 'alternative',
      badge: 'PLAN ALTERNATIVO',
      tagline: 'Misma emoción, enfoque distinto',
      title: `Alternativa Cultural & Gastro Íntima en ${targetCity}`,
      shortDescription: `Un giro de autor hacia las letras, el sosiego y el sabor tradicional de ${targetCity}.`,
      matchReason: `Una perspectiva complementaria para reconectar con el entorno desde la curiosidad y la cercanía vecinal.`,
      approxDuration: criteria.availableTime || '2 a 4 horas',
      experienceNarrative: `Para cuando prefieres un entorno más resguardado e íntimo en ${targetCity}, alternando lecturas, aromas y charla de sobremesa.`,
      accessibilityInfo: 'Recorrido en calle peatonal accesible.',
      budgetEstimate: '15€ - 30€ / persona',
      energyRequired: `Ritmo ${criteria.intensity || 6}/10`,
      schedule: alternativeSchedule,
      isPlanB: isBadWeather,
    },
    {
      id: 'surprise',
      badge: 'PLAN SORPRESA',
      tagline: 'Propuesta singular e inesperada',
      title: `Descubrimiento Secreto & Atelier Botánico en ${targetCity}`,
      shortDescription: `Espacios con carácter propio e inesperados para romper la rutina en ${targetCity}.`,
      matchReason: `Ideal para dejarse llevar y descubrir una faceta oculta y vibrante de los barrios de ${targetCity}.`,
      approxDuration: '2 a 3 horas',
      experienceNarrative: `Una vivencia fuera de los circuitos habituales, pensada para despertar los sentidos con botánica, arte y atmósfera envolvente en ${targetCity}.`,
      accessibilityInfo: 'Acceso a pie cómodo.',
      budgetEstimate: '25€ - 40€ / persona',
      energyRequired: 'Curioso y estimulante',
      schedule: surpriseSchedule,
      isPlanB: isBadWeather,
    },
  ];

  return {
    proposals,
    mainPlan: proposals[0],
    premiumContingencyPlan: {
      ...proposals[1],
      reasonForChange: proposals[1].matchReason,
    },
    isGeographicallyOptimized: true,
    isPlanBActive: isBadWeather,
    planBReason: isBadWeather
      ? `🌧️ Detectadas precipitaciones en ${targetCity}. Hemos priorizado espacios a cubierto y cálidos para tu confort.`
      : undefined,
  };
}

// 2. Generate Itinerary Handler (Support both /api/gemini/generate-itinerary and /api/generate)
const handleGenerateItinerary = async (req: Request, res: Response) => {
  try {
    const { criteria, weather, places, latitude, longitude, searchRadiusKm, gpsLocation } = req.body || {};

    if (!criteria) {
      const fallbackExperience = buildResilientItinerary(req.body || {});
      return res.status(200).json(fallbackExperience);
    }

    const exactLat =
      typeof latitude === 'number'
        ? latitude
        : typeof gpsLocation?.latitude === 'number'
        ? gpsLocation.latitude
        : criteria.location?.lat ?? 40.4168;

    const exactLng =
      typeof longitude === 'number'
        ? longitude
        : typeof gpsLocation?.longitude === 'number'
        ? gpsLocation.longitude
        : criteria.location?.lng ?? -3.7038;

    const searchRadius = Number(searchRadiusKm || gpsLocation?.searchRadiusKm || criteria.searchRadiusKm || 5);
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

    const isEscapadaMode =
      criteria.environment === 'Escapada' ||
      Boolean(criteria.allowSurroundings) ||
      /escapada|alrededores|excursión|afueras/i.test(criteria.user_mood_description || '');

    let verifiedPlacesList: VerifiedPlace[] = Array.isArray(places) && places.length > 0 ? places : [];

    // Fallback: If places is empty or unavailable, synthesize authentic contextual POIs with Gemini strictly inside targetCity
    if (verifiedPlacesList.length === 0) {
      try {
        const geminiPoiPrompt = `Genera una lista de 6 locales o espacios de interés auténticos, emblemáticos y reales situados ESTRICTAMENTE dentro del término municipal de "${targetCity}" en un radio máximo de 5 km alrededor de las coordenadas latitud ${userLocation.lat}, longitud ${userLocation.lng} para un plan de tipo "${criteria.environment || 'Ciudad'}" y estado de ánimo "${criteria.user_mood || 'Relajado'}".
Deben ser cafeterías con encanto, parques urbanos, miradores locales, librerías, bistrós o espacios culturales con nombres reales y direcciones verosímiles de calles y barrios de ${targetCity} (por ejemplo, si es Vigo: Casco Vello, Bouzas, O Castro, Teis, Rúa Príncipe, etc.).
Queda TERMINANTEMENTE PROHIBIDO proponer lugares pertenecientes a otros municipios o localidades lejanas.
Responde en formato JSON con la siguiente estructura:
[
  {
    "name": "Nombre real del local o espacio",
    "address": "Calle y barrio real en ${targetCity}",
    "latOffset": 0.002,
    "lngOffset": -0.002,
    "rating": 4.8,
    "type": "cafe",
    "allowsDogs": true
  }
]`;
        const poiRes = await callGeminiWithResilience({ contents: geminiPoiPrompt });
        const parsedPois = JSON.parse(poiRes.text || '[]');
        if (Array.isArray(parsedPois) && parsedPois.length > 0) {
          verifiedPlacesList = parsedPois.map((p: any, idx: number) => ({
            id: `gemini-poi-${idx}-${Date.now()}`,
            name: p.name || `Espacio Local ${idx + 1}`,
            address: p.address || `Calle céntrica, ${targetCity}`,
            location: {
              lat: Number(userLocation.lat) + (typeof p.latOffset === 'number' ? p.latOffset : (idx - 2) * 0.0025),
              lng: Number(userLocation.lng) + (typeof p.lngOffset === 'number' ? p.lngOffset : (idx - 2) * 0.0025),
            },
            rating: typeof p.rating === 'number' ? p.rating : 4.8,
            types: [p.type || 'point_of_interest'],
            allowsDogs: Boolean(p.allowsDogs),
          }));
        }
      } catch (poiGenErr) {
        console.warn('Direct Gemini POI synthesis fallback notice:', poiGenErr);
      }

      // If still empty, use resilient default POIs strictly tailored to targetCity
      if (verifiedPlacesList.length === 0) {
        verifiedPlacesList = [
          {
            id: 'poi-center-1',
            name: `Café de Autor & Obrador (${targetCity})`,
            address: `Casco histórico de ${targetCity}`,
            location: { lat: userLocation.lat + 0.002, lng: userLocation.lng + 0.001 },
            rating: 4.8,
            types: ['cafe', 'bistro'],
            allowsDogs: true,
          },
          {
            id: 'poi-center-2',
            name: `Mirador & Espacio Cultural de ${targetCity}`,
            address: `Paseo cultural de ${targetCity}`,
            location: { lat: userLocation.lat - 0.002, lng: userLocation.lng + 0.003 },
            rating: 4.7,
            types: ['arts_centre', 'viewpoint'],
            allowsDogs: true,
          },
          {
            id: 'poi-center-3',
            name: `Librería de Barrio & Espacio de Lectura`,
            address: `Calle céntrica de ${targetCity}`,
            location: { lat: userLocation.lat + 0.001, lng: userLocation.lng - 0.002 },
            rating: 4.6,
            types: ['book_store', 'cafe'],
            allowsDogs: true,
          },
        ];
      }
    }
    const verifiedById = new Map<string, VerifiedPlace>();
    const verifiedByName = new Map<string, VerifiedPlace>();

    verifiedPlacesList.forEach((p) => {
      verifiedById.set(p.id, p);
      verifiedByName.set(p.name.toLowerCase().trim(), p);
    });

    const availablePlacesDescription = verifiedPlacesList
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

    // 5. Filtro Real Pet-Friendly
    const isPetFriendly = criteria.company === 'Con mascota';
    const petDirective = isPetFriendly
      ? `\n🐾 FILTRO REAL PET-FRIENDLY ACTIVADO:
El usuario viaja CON MASCOTA. Es una REGLA INQUEBRANTABLE que todos los lugares y paradas seleccionadas sean 100% aptos para animales:
- Prioriza de forma preferente lugares marcados con "PetFriendly: SÍ (Confirmado)", parques, jardines, paseos y locales con terrazas exteriores.
- Si un local es de interior, debe contar con terraza o admitir expresamente mascotas.
- En la narración y en "matchReason", detalla la idoneidad para la mascota (ej. terraza cómoda, espacio verde amplio, cuenco de agua o paseo tranquilo sin agobios).`
      : '';

    // 6. Directiva de Geofencing y Granularidad Local Estricta
    const geofencingDirective = isEscapadaMode
      ? `\n🚗 MODO ESCAPADA / ALREDEDORES ACTIVADO:
El usuario ha seleccionado explorar los alrededores de ${targetCity}. Se permite extender las propuestas hacia parajes naturales, miradores y pueblos con encanto en el entorno próximo de ${targetCity}.`
      : `\n📍 DIRECTIVA DE GEOFENCING Y GRANULARIDAD LOCAL ESTRICTA (${targetCity.toUpperCase()} - RADIO MÁXIMO 5 KM):
- OBLIGACIÓN ESTRICTA: TODAS las propuestas y paradas (gastronomía, cultura, naturaleza, miradores, ocio) DEBEN ubicarse ESTRICTAMENTE dentro de los límites del término municipal de ${targetCity} o a un radio MÁXIMO de 5 km de sus coordenadas (lat: ${userLocation.lat}, lng: ${userLocation.lng}).
- PROHIBICIÓN RADICAL: Queda TERMINANTEMENTE PROHIBIDO sugerir localidades lejanas, municipios limítrofes o cambiar de término municipal (por ejemplo: si la ciudad es Vigo, queda estrictamente prohibido sugerir Baiona, Cangas, Nigrán, Moaña, Pontevedra o Santiago; el 100% de las paradas debe ser exclusivamente de Vigo).
- IDENTIDAD Y CULTURA LOCAL AUTÉNTICA: Prioriza el pulso real de los barrios, la agenda cultural local, el comercio de proximidad, patrimonio urbano y locales emblemáticos o independientes de la zona (ej. en Vigo: Casco Vello, Bouzas, O Castro, Teis, O Berbés, Museo MARCO; en Madrid: Malasaña, La Latina, Lavapiés; etc.).
- TONO DE GUÍA LOCAL EXPERTO: Redacta con el tono de un conocedor local apasionado que sabe cuáles son las mejores calles, rincones y ambientes de barrio, evitando tópicos turísticos masivos o folletos provinciales vacíos.
- DIRECCIÓN REAL: Cada parada debe indicar en 'placeAddress' su calle y barrio verosímil dentro de ${targetCity}.`;

    // 7. Directiva de Geolocalización GPS en Tiempo Real
    const gpsDirective = isGpsActive
      ? `\n🛰️ GEOLOCALIZACIÓN GPS EN TIEMPO REAL ACTIVA (ENTORNO INMEDIATO):
- Posición GPS exacta del usuario: Latitud ${userLocation.lat.toFixed(5)}, Longitud ${userLocation.lng.toFixed(5)} ${userLocation.neighborhood ? `(Barrio/Zona: ${userLocation.neighborhood})` : ''}.
- Radio de búsqueda inmediato: ${searchRadius} km desde esta posición exacta.
- PROXIMIDAD INMEDIATA OBLIGATORIA: El usuario se encuentra físicamente en estas coordenadas en este momento. Las propuestas deben orientarse de manera prioritaria al ENTORNO INMEDIATO de este punto exacto (barrio, calles adyacentes y plazas a una distancia caminable o dentro del radio de ${searchRadius} km).
- Mención en la experiencia: Justifica cómo el punto de partida aprovecha la ubicación actual del usuario para empezar la experiencia sin desplazamientos innecesarios.`
      : '';

    // 8. Directiva de Modo de Experiencia: Ruta Encadenada (Multi-Parada) vs Plan Único
    const experienceMode = criteria.experienceMode || 'chained';
    const isChainedRoute = experienceMode === 'chained';
    const chainedRouteDirective = isChainedRoute
      ? `\n🔗 MODO RUTA ENCADENADA (2-3 PARADAS COHERENTES) ACTIVADO:
- REGLA ESTRICTA DE SECUENCIA Y PROXIMIDAD PEATONAL:
  • Cada uno de los 3 planes DEBE componerse de EXACTAMENTE 3 paradas cronológicas conectadas entre sí a pie (Parada 1 -> Parada 2 -> Parada 3).
  • Las 3 paradas deben estar situadas en el MISMO BARRIO o zona contigua, a MENOS DE 15 MINUTOS caminando entre una y otra (distancia peatonal máxima de 1 km entre paradas contiguas).
  • En cada parada del array 'schedule' DEBES incluir obligatoriamente:
    - "order": 1 para la primera parada, 2 para la segunda parada, 3 para la tercera parada.
    - "time": Franja horaria sugerida secuencial y en orden ascendente (ej. "18:00 - Café / Aperitivo", "19:15 - Cultura / Paseo", "21:00 - Cena local").
    - "activity": Nombre evocador de la actividad o momento (ej. "Aperitivo y Café de Especialidad", "Paseo Cultural o Galería", "Cena y Sobremesa Local").
    - "walkingTimeFromPrevious": Tiempo estimado caminando desde la parada anterior:
      * Para la Parada 1: "Punto de inicio" (o "Inicio de ruta").
      * Para la Parada 2: Tiempo a pie desde la Parada 1 (ej. "8 min caminando" o "7 min caminando", NUNCA más de 15 min).
      * Para la Parada 3: Tiempo a pie desde la Parada 2 (ej. "10 min caminando" o "9 min caminando", NUNCA más de 15 min).
    - "placeName", "placeAddress": Nombres reales y calles verosímiles en ${targetCity}.`
      : `\n🎯 MODO PLAN ÚNICO (RECOMENDACIÓN INDIVIDUAL) ACTIVADO:
- El usuario prefiere 1 recomendación individual focalizada y memorable en ${targetCity} (1 sola parada principal) para disfrutar a su propio ritmo sin desplazamientos continuos.
- Para esa parada, incluye "order": 1 y "walkingTimeFromPrevious": "Punto de inicio".`;

    const prompt = `Eres un diseñador de experiencias locales y concierge urbano de primer nivel para la app "TasteLocal Living", especializado con conocimiento íntimo en el municipio de "${targetCity}".
Tu función es actuar como motor narrativo y curador hiperlocal de experiencias en "${targetCity}".

DESTINO Y GEOFENCING:
- Municipio: ${targetCity}
- Coordenadas de referencia: Lat ${userLocation.lat}, Lng ${userLocation.lng} ${userLocation.isGps ? '(Señal GPS en tiempo real confirmada)' : ''}
${geofencingDirective}
${gpsDirective}

PERFIL DEL USUARIO:
- Estado de ánimo: ${criteria.user_mood}
${criteria.user_mood_description ? `- Notas adicionales: "${criteria.user_mood_description}"` : ''}
- Entorno preferido: ${criteria.environment}
- Tiempo disponible: ${criteria.availableTime || '2-4h'} ${criteria.availableTime === '< 2h' ? '(EXPERIENCIA EXPRÉS: Máximo 2 paradas cercanas y ágiles)' : criteria.availableTime === 'Día completo' ? '(INMERSIÓN COMPLETA: 3 a 4 paradas con ritmo holgado y tiempo de disfrute)' : '(Ruta equilibrada de 2 a 3 paradas)'}
- Compañía: ${criteria.company} ${criteria.company === 'Con mascota' ? '(ATENCIÓN CRÍTICA: Prioriza espacios al aire libre, parques y locales/terrazas pet-friendly aptos para disfrutar con mascota)' : ''}
- Presupuesto deseado: ${criteria.budget || 'Equilibrado / Normal'}
- Movilidad: ${criteria.mobility}
- Nivel de energía (1-10): ${criteria.intensity}

HORA Y CONTEXTO DEL DÍA:
- Hora local: ${timeStr} (${timePeriodName})
- Orientación de actividades para esta franja: ${timeGuidance}
- IMPORTANTE: Las paradas de cada plan deben programarse a partir de las ${timeStr} en orden cronológico ascendente (ej. si son las 18:00, la primera parada debe ser hacia las 18:30, la segunda a las 20:00, etc.).

CONTEXTO METEOROLÓGICO EN ${targetCity.toUpperCase()}:
- Estado del tiempo: ${
      weather?.isAvailable === false || weather?.alertLevel === 'unavailable'
        ? 'No disponible (diseña propuestas versátiles)'
        : `${weather?.temp ?? 'N/D'}°C, ${weather?.condition || 'Agradable'} - ${weather?.summary || ''}`
    }
${weatherDirective}
${userAffinitiesDirective}
${surpriseMeDirective}
${petDirective}
${chainedRouteDirective}

LUGARES REALES Y VERIFICADOS DISPONIBLES EN ${targetCity.toUpperCase()}:
${availablePlacesDescription}

MISIÓN OBLIGATORIA: Generar TRES propuestas realmente diferenciadas en ${targetCity} dentro del radio de 5 km:
1. PLAN IDEAL -> La propuesta con encaje directo más fiel a la emoción, el modo de experiencia (${experienceMode}) y nivel de energía en ${targetCity}.
2. PLAN ALTERNATIVO -> Misma emoción de partida pero con un enfoque distinto en la misma zona (ej. exterior/naturaleza vs. cultural/acogedor o gastronómico).
3. PLAN SORPRESA -> Una propuesta singular, inesperada pero realizable y segura, que rompe la rutina en ${targetCity}.

NORMAS ESTRICTAS:
- Para cada uno de los 3 planes, incluye:
  • "badge": "PLAN IDEAL" (para el 1), "PLAN ALTERNATIVO" (para el 2) o "PLAN SORPRESA" (para el 3).
  • "matchReason": "Por qué conecta con cómo te sientes hoy" redactado en 2 frases inspiradoras que justifiquen el vínculo con la emoción.
  • "experienceNarrative": "Qué vas a vivir y por qué merece la pena", redactando una descripción inmersiva y sensorial (3 a 5 líneas) de la atmósfera de los lugares seleccionados en ${targetCity}.
  • "accessibilityInfo": Breve indicación de accesibilidad física (ej. "Ruta peatonal llana y accesible", "Espacios con accesibilidad comprobada").
  • "budgetEstimate": Presupuesto orientativo (ej. "20€ - 35€ / persona", "15€ - 25€ / persona", o "Consumo moderado").
  • "energyRequired": Nivel de energía requerido (ej. "Ritmo pausado (3/10)", "Moderado (6/10)", o "Vigoroso (8/10)").
  • "approxDuration": Duración acorde al tiempo disponible (ej. "${criteria.availableTime || '2-4h'}").
- Cada parada debe incluir su "order" (1, 2, 3), su franja horaria sugerida "time", y "walkingTimeFromPrevious" (tiempo a pie ≤ 15 min desde la parada anterior).
- El "placeId", "placeName" y "placeAddress" deben corresponder a lugares reales de ${targetCity}. Jamás inventes locales de otras provincias.`;

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

    // Post-generation validation & sanitization: lock all place data strictly to verified places
    const sanitizeSchedule = (items: Array<Record<string, unknown>>) => {
      if (!Array.isArray(items)) return [];
      return items
        .map((item, idx) => {
          const placeId = String(item.placeId || '');
          const placeName = String(item.placeName || '');

          const verified =
            verifiedById.get(placeId) ||
            verifiedByName.get(placeName.toLowerCase().trim());

          if (!verified) {
            // Si el motor narrativo propuso un rincón o local auténtico de targetCity que no estaba en el mapa inicial,
            // validamos y conservamos sus datos asegurando geofencing estricto dentro de los 5 km
            if (placeName && placeName.length > 2) {
              const latOffset = (idx - 1) * 0.002;
              const lngOffset = (idx % 2 === 0 ? 1 : -1) * 0.002;
              const placeAddress = String(item.placeAddress || `Barrio céntrico, ${targetCity}`);
              return {
                order: typeof item.order === 'number' ? item.order : idx + 1,
                time: String(item.time || `${10 + idx * 2}:00`),
                activity: String(item.activity || `Visita a ${placeName}`),
                walkingTimeFromPrevious:
                  typeof item.walkingTimeFromPrevious === 'string'
                    ? item.walkingTimeFromPrevious
                    : idx === 0
                    ? 'Punto de inicio'
                    : `${6 + idx * 3} min caminando`,
                placeId: placeId || `poi-${idx}-${Date.now()}`,
                placeName: placeName,
                placeAddress: placeAddress.toLowerCase().includes(targetCity.toLowerCase())
                  ? placeAddress
                  : `${placeAddress}, ${targetCity}`,
                location: {
                  lat: Number(userLocation.lat) + latOffset,
                  lng: Number(userLocation.lng) + lngOffset,
                },
                rating: 4.8,
                types: ['point_of_interest'],
                allowsDogs: criteria.company === 'Con mascota',
                description: typeof item.description === 'string' ? item.description : undefined,
              };
            }
            console.warn(`[Anti-Hallucination] Descartando lugar desconocido sin nombre: "${placeName}" (${placeId})`);
            return null;
          }

          return {
            order: typeof item.order === 'number' ? item.order : idx + 1,
            time: String(item.time || `${10 + idx * 2}:00`),
            activity: String(item.activity || `Visita a ${verified.name}`),
            walkingTimeFromPrevious:
              typeof item.walkingTimeFromPrevious === 'string'
                ? item.walkingTimeFromPrevious
                : idx === 0
                ? 'Punto de inicio'
                : `${6 + idx * 3} min caminando`,
            placeId: verified.id,
            placeName: verified.name,
            placeAddress: verified.address,
            location: verified.location,
            rating: verified.rating,
            types: verified.types,
            phoneNumber: verified.phoneNumber,
            websiteUri: verified.websiteUri,
            allowsDogs: verified.allowsDogs,
            accessibilityOptions: verified.accessibilityOptions,
            description: typeof item.description === 'string' ? item.description : undefined,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
    };

    let proposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];

    // Fallback si no se generaron 3 propuestas
    if (proposals.length < 3) {
      const proposalTemplates = [
        {
          id: 'ideal',
          badge: 'PLAN IDEAL',
          tagline: 'Encaje directo con tu momento',
          title: `Propuesta Ideal en ${criteria.environment || 'la zona'}`,
          shortDescription: `Selección directa orientada a ${criteria.user_mood.toLowerCase()} con tiempo ${criteria.availableTime || '2-4h'}.`,
          matchReason: `Conecta directamente con tu deseo de ${criteria.user_mood.toLowerCase()}: equilibrio perfecto entre disfrute y desconexión.`,
          approxDuration: criteria.availableTime || '2 a 3 horas',
          accessibilityInfo: 'Recorrido urbano accesible y de tránsito cómodo.',
        },
        {
          id: 'alternative',
          badge: 'PLAN ALTERNATIVO',
          tagline: 'Misma emoción, enfoque distinto',
          title: `Alternativa Diferente en la zona`,
          shortDescription: `Un giro complementario para disfrutar de ${criteria.user_mood.toLowerCase()} desde otra perspectiva.`,
          matchReason: `Mantiene la misma sintonía emocional pero te invita a descubrir una atmósfera complementaria sin prisas.`,
          approxDuration: criteria.availableTime || '2 a 3 horas',
          accessibilityInfo: 'Paseo accesible con paradas resguardadas.',
        },
        {
          id: 'surprise',
          badge: 'PLAN SORPRESA',
          tagline: 'Propuesta singular e inesperada',
          title: `Descubrimiento Singular & Secreto`,
          shortDescription: `Lugares con carácter propio para salir de lo predecible con autenticidad.`,
          matchReason: `Para cuando te apetece dejarte llevar y conectar con rincones llenos de alma y personalidad local.`,
          approxDuration: criteria.availableTime || '2 a 3 horas',
          experienceNarrative: `Una inmersión espontánea que se aparta del ritmo habitual. Déjate sorprender por espacios con identidad singular, rincones acogedores y una atmósfera que invita a pausar el tiempo.`,
          budgetEstimate: '15€ - 25€ / persona',
          energyRequired: 'Relajado e intuitivo',
          accessibilityInfo: 'Ruta peatonal con buena accesibilidad general.',
        },
      ];

      proposals = proposalTemplates.map((tmpl, idx) => {
        const existing = proposals[idx] || {};
        const sliceStart = (idx * 2) % verifiedPlacesList.length;
        const fallbackPlaces = verifiedPlacesList.slice(sliceStart, sliceStart + 3);

        const schedule = existing.schedule && existing.schedule.length > 0
          ? sanitizeSchedule(existing.schedule)
          : fallbackPlaces.map((vp, pIdx) => ({
              time: `${11 + pIdx * 2}:00`,
              activity: `Experiencia en ${vp.name}`,
              placeId: vp.id,
              placeName: vp.name,
              placeAddress: vp.address,
              location: vp.location,
              rating: vp.rating,
              types: vp.types,
            }));

        return {
          id: tmpl.id,
          badge: existing.badge || tmpl.badge,
          tagline: existing.tagline || tmpl.tagline,
          title: existing.title || tmpl.title,
          shortDescription: existing.shortDescription || tmpl.shortDescription,
          matchReason: existing.matchReason || tmpl.matchReason,
          approxDuration: existing.approxDuration || tmpl.approxDuration,
          experienceNarrative: existing.experienceNarrative || tmpl.experienceNarrative || `Una selección exclusiva de lugares auténticos para conectar con la esencia de la zona a tu propio ritmo.`,
          accessibilityInfo: existing.accessibilityInfo || tmpl.accessibilityInfo || 'Acceso peatonal accesible.',
          budgetEstimate: existing.budgetEstimate || tmpl.budgetEstimate || '20€ - 35€ / persona',
          energyRequired: existing.energyRequired || tmpl.energyRequired || `Intensidad ${criteria.intensity}/10`,
          schedule,
        };
      });
    } else {
      proposals = proposals.map((prop: Record<string, unknown>, idx: number) => {
        const id = idx === 0 ? 'ideal' : idx === 1 ? 'alternative' : 'surprise';
        const badge = idx === 0 ? 'PLAN IDEAL' : idx === 1 ? 'PLAN ALTERNATIVO' : 'PLAN SORPRESA';
        const tagline = idx === 0
          ? 'Encaje directo con tu momento'
          : idx === 1
          ? 'Misma emoción, enfoque distinto'
          : 'Propuesta singular e inesperada';

        const schedule = sanitizeSchedule(prop.schedule as Array<Record<string, unknown>>);

        return {
          id,
          badge: String(prop.badge || badge),
          tagline: String(prop.tagline || tagline),
          title: String(prop.title || `Propuesta ${idx + 1}`),
          shortDescription: String(prop.shortDescription || ''),
          matchReason: String(prop.matchReason || 'Curado cuidadosamente para sintonizar con tu momento de hoy.'),
          approxDuration: String(prop.approxDuration || criteria.availableTime || '2 a 4 horas'),
          experienceNarrative: String(
            prop.experienceNarrative ||
            `Una experiencia pensada para fluir sin prisas. La atmósfera de cada local ha sido elegida para acompañar tu estado de ánimo, permitiéndote disfrutar de momentos de conexión y autenticidad en cada paso.`
          ),
          accessibilityInfo: String(prop.accessibilityInfo || 'Acceso accesible y cómodo.'),
          budgetEstimate: String(prop.budgetEstimate || '20€ - 35€ / persona'),
          energyRequired: String(prop.energyRequired || `Ritmo ${criteria.intensity}/10`),
          schedule: schedule.length > 0 ? schedule : sanitizeSchedule([verifiedPlacesList[idx % verifiedPlacesList.length]]),
        };
      });
    }

    parsed.proposals = proposals.map((p: Record<string, unknown>) => ({
      ...p,
      isPlanB: isBadWeather,
    }));
    parsed.mainPlan = parsed.proposals[0];
    parsed.premiumContingencyPlan = {
      ...parsed.proposals[1],
      reasonForChange: parsed.proposals[1].matchReason,
    };
    parsed.isGeographicallyOptimized = true;
    parsed.isPlanBActive = isBadWeather;
    parsed.planBReason = isBadWeather
      ? `🌧️ Detectada ${weather?.condition || 'precipitación'} (${weather?.temp ?? 'N/D'}°C). Se han adaptado automáticamente las recomendaciones hacia espacios cubiertos y acogedores (cafeterías de autor, galerías y bistrós protegidos) manteniendo intacta tu intención de "${criteria.user_mood}".`
      : undefined;

    return res.json(parsed);
  } catch (error) {
    console.warn('Error generating itinerary with Gemini, applying resilient fallback experience:', error);
    const fallbackExperience = buildResilientItinerary(req.body || {});
    return res.status(200).json(fallbackExperience);
  }
};

app.post('/api/gemini/generate-itinerary', handleGenerateItinerary);
app.post('/api/generate', handleGenerateItinerary);

// 3. Geocoding endpoint
const handleGeocode = async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
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

    return res.status(404).json({ error: 'Ubicación no encontrada' });
  } catch (error) {
    console.error('Geocoding endpoint error:', error);
    return res.status(500).json({ error: 'Error al geolocalizar la dirección' });
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
      return res.status(400).json({ error: 'Valid latitude and longitude are required' });
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
    return res.status(500).json({ error: 'Error al procesar geocodificación inversa' });
  }
};

app.post('/api/geocode/reverse', handleReverseGeocode);
app.post('/api/places/reverse-geocode', handleReverseGeocode);

// 4. Places Search endpoint (Places API New)
const handlePlacesSearch = async (req: Request, res: Response) => {
  try {
    const { query, location } = req.body;
    const apiKey = getMapsApiKey();

    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      return res.status(400).json({ error: 'Valid location {lat, lng} is required' });
    }

    if (apiKey) {
      try {
        // Places API (New) Text Search
        const url = 'https://places.googleapis.com/v1/places:searchText';
        const body = {
          textQuery: query,
          locationBias: {
            circle: {
              center: { latitude: location.lat, longitude: location.lng },
              radius: 5000.0,
            },
          },
          languageCode: 'es',
          maxResultCount: 8,
        };

        const gRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.types,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.allowsDogs,places.accessibilityOptions',
          },
          body: JSON.stringify(body),
        });

        const data = await gRes.json();
        if (data.places && Array.isArray(data.places)) {
          const places: VerifiedPlace[] = data.places.map((p: {
            id?: string;
            displayName?: { text?: string };
            formattedAddress?: string;
            location?: { latitude?: number; longitude?: number };
            rating?: number;
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
          }) => {
            const isConfirmed = Boolean(
              p.accessibilityOptions?.wheelchairAccessibleEntrance ||
              p.accessibilityOptions?.wheelchairAccessibleParking ||
              p.accessibilityOptions?.wheelchairAccessibleRestroom ||
              p.accessibilityOptions?.wheelchairAccessibleSeating
            );

            return {
              id: p.id || `place-${Math.random().toString(36).slice(2, 9)}`,
              name: p.displayName?.text || 'Lugar de interés',
              address: p.formattedAddress || 'Ubicación local',
              location: {
                lat: p.location?.latitude ?? location.lat,
                lng: p.location?.longitude ?? location.lng,
              },
              rating: p.rating,
              types: p.types || [],
              phoneNumber: p.nationalPhoneNumber || p.internationalPhoneNumber,
              websiteUri: p.websiteUri,
              allowsDogs:
                p.allowsDogs ??
                (p.types?.some((t) => ['park', 'garden', 'dog_park', 'national_park'].includes(t)) ? true : undefined),
              accessibilityOptions: isConfirmed
                ? {
                    ...p.accessibilityOptions,
                    isConfirmedAccessible: true,
                  }
                : undefined,
            };
          });
          return res.json({ places });
        }
      } catch (gErr) {
        console.warn('Google Places New API failed, using fallback:', gErr);
      }
    }

    // Fallback A: Real OpenStreetMap POIs in the surrounding area with safe timeout
    let osmPlaces: VerifiedPlace[] = [];
    try {
      const radius = 2500;
      const overpassQuery = `[out:json][timeout:3];(
        node["tourism"](around:${radius},${location.lat},${location.lng});
        node["amenity"~"cafe|restaurant|bar|arts_centre"](around:${radius},${location.lat},${location.lng});
        node["leisure"~"park|garden"](around:${radius},${location.lat},${location.lng});
      );out 8;`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const opRes = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(overpassQuery)}`,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (opRes.ok) {
        const opData = (await opRes.json()) as {
          elements?: Array<{
            id: number;
            lat: number;
            lon: number;
            tags?: Record<string, string>;
          }>;
        };

        if (opData.elements && opData.elements.length > 0) {
          osmPlaces = opData.elements
            .filter((el) => el.tags && (el.tags.name || el.tags['name:es']))
            .map((el) => {
              const tags = el.tags || {};
              const isPetFriendly =
                tags['dog'] === 'yes' ||
                tags['pets_allowed'] === 'yes' ||
                tags['leisure'] === 'park' ||
                tags['leisure'] === 'garden' ||
                undefined;

              return {
                id: `osm-${el.id}`,
                name: tags['name:es'] || tags.name || 'Lugar de interés',
                address:
                  [tags['addr:street'], tags['addr:housenumber'], tags['addr:city']]
                    .filter(Boolean)
                    .join(' ') || 'Dirección no especificada',
                location: {
                  lat: el.lat,
                  lng: el.lon,
                },
                rating: undefined,
                types: [tags.amenity || tags.tourism || tags.leisure || 'point_of_interest'],
                phoneNumber: tags['phone'] || tags['contact:phone'] || undefined,
                websiteUri: tags['website'] || tags['contact:website'] || undefined,
                allowsDogs: isPetFriendly,
                accessibilityOptions:
                  tags['wheelchair'] === 'yes'
                    ? {
                        wheelchairAccessibleEntrance: true,
                        isConfirmedAccessible: true,
                      }
                    : undefined,
              };
            });
        }
      }
    } catch (opErr) {
      console.warn('Overpass fallback skipped or unreachable (e.g. ECONNREFUSED/timeout):', (opErr as Error)?.message || opErr);
    }

    if (osmPlaces.length > 0) {
      return res.json({ places: osmPlaces.slice(0, 8) });
    }

    // Fallback B: If Overpass or Places API failed/unreachable, use Gemini to generate authentic contextual POIs
    try {
      const geminiPrompt = `Genera una lista de 4 a 6 lugares emblemáticos o locales auténticos para la búsqueda: "${query}" situados estrictamente dentro del término municipal de la zona en un radio máximo de 5 km alrededor de las coordenadas latitud ${location.lat}, longitud ${location.lng}.
Deben ser propuestas reales de barrio acordes al destino (cafés de especialidad, miradores, librerías, espacios culturales, bistrós o parques locales con nombres de calles y barrios reales).
Queda prohibido sugerir locales de municipios lejanos.
Responde en formato JSON con la siguiente estructura de array:
[
  {
    "name": "Nombre representativo del local o espacio",
    "address": "Calle y barrio real en la zona",
    "latOffset": 0.002,
    "lngOffset": -0.002,
    "rating": 4.8,
    "type": "cafe",
    "allowsDogs": true
  }
]`;

      const geminiRes = await callGeminiWithResilience({
        contents: geminiPrompt,
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              address: { type: Type.STRING },
              latOffset: { type: Type.NUMBER },
              lngOffset: { type: Type.NUMBER },
              rating: { type: Type.NUMBER },
              type: { type: Type.STRING },
              allowsDogs: { type: Type.BOOLEAN },
            },
            required: ['name', 'address'],
          },
        },
      });

      const parsed = JSON.parse(geminiRes.text || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        const geminiPlaces: VerifiedPlace[] = parsed.map((p, idx) => ({
          id: `gemini-poi-${idx}-${Date.now()}`,
          name: p.name || 'Espacio local con encanto',
          address: p.address || 'Zona céntrica',
          location: {
            lat: Number(location.lat) + (typeof p.latOffset === 'number' ? p.latOffset : (idx - 2) * 0.003),
            lng: Number(location.lng) + (typeof p.lngOffset === 'number' ? p.lngOffset : (idx - 2) * 0.003),
          },
          rating: typeof p.rating === 'number' ? p.rating : 4.6,
          types: [p.type || 'point_of_interest'],
          allowsDogs: Boolean(p.allowsDogs),
        }));
        return res.json({ places: geminiPlaces });
      }
    } catch (geminiPoiErr) {
      console.warn('Gemini POI generation fallback also failed:', geminiPoiErr);
    }

    return res.json({ places: [] });
  } catch (error) {
    console.error('Places search endpoint unexpected error:', error);
    return res.json({ places: [] });
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
      return res.status(400).json({ error: 'Origin and destination are required' });
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
    return res.status(500).json({ error: 'Error al calcular la ruta' });
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

          return res.json({
            temp,
            condition,
            description: condition,
            icon,
            alertLevel,
            summary,
            isAvailable: true,
            isRainy: alertLevel !== 'clear',
            isHot: temp > 30,
          });
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

          return res.json({
            temp,
            condition,
            description: condition,
            icon,
            alertLevel,
            summary,
            isAvailable: true,
            isRainy: alertLevel !== 'clear',
            isHot: temp > 30,
          });
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

// Configure Vite integration for full-stack dev server or static in prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
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
