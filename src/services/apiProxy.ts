import {
  UserLocation,
  Mood,
  SearchCriteria,
  WeatherInfo,
  Plan,
  GeneratedItinerary,
  RouteInfo,
  SwipeCardItem,
  GroupSwipeSession,
  StructuredApiError,
} from '../types';

const BASE_API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export class ApiClientError extends Error {
  code: string;
  requestId?: string;
  retryable: boolean;
  status: number;
  suggestedRadiusKm?: number;
  retryAfterSeconds?: number;

  constructor(params: {
    code: string;
    message: string;
    status: number;
    requestId?: string;
    retryable?: boolean;
    suggestedRadiusKm?: number;
    retryAfterSeconds?: number;
  }) {
    super(params.message);
    this.name = 'ApiClientError';
    this.code = params.code;
    this.status = params.status;
    this.requestId = params.requestId;
    this.retryable = Boolean(params.retryable);
    this.suggestedRadiusKm = params.suggestedRadiusKm;
    this.retryAfterSeconds = params.retryAfterSeconds;
  }

  toStructured(): StructuredApiError {
    return {
      code: this.code,
      message: this.message,
      requestId: this.requestId,
      retryable: this.retryable,
      suggestedRadiusKm: this.suggestedRadiusKm,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }
}

async function parseApiError(res: Response, fallbackMessage: string): Promise<ApiClientError> {
  const payload = (await res.json().catch(() => ({}))) as Partial<StructuredApiError> & {
    error?: string;
  };

  if (res.status === 429) {
    const waitSec = payload.retryAfterSeconds || 30;
    return new ApiClientError({
      code: payload.code || 'RATE_LIMITED',
      message:
        payload.message ||
        `Has realizado demasiadas consultas seguidas. Espera ${waitSec} segundos antes de intentarlo de nuevo.`,
      status: 429,
      requestId: payload.requestId,
      retryable: true,
      retryAfterSeconds: waitSec,
    });
  }

  const code =
    payload.code ||
    (res.status === 404
      ? 'NOT_FOUND'
      : res.status === 503
      ? 'MAPS_UNAVAILABLE'
      : res.status >= 500
      ? 'INTERNAL_ERROR'
      : 'INVALID_REQUEST');

  return new ApiClientError({
    code,
    message: payload.message || payload.error || fallbackMessage,
    status: res.status,
    requestId: payload.requestId,
    retryable: payload.retryable ?? res.status >= 500,
    suggestedRadiusKm: payload.suggestedRadiusKm,
    retryAfterSeconds: payload.retryAfterSeconds,
  });
}

export async function geocodeAddressProxy(query: string): Promise<UserLocation | null> {
  try {
    const res = await fetch(`${BASE_API_URL}/api/places/geocode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      throw await parseApiError(res, 'No pudimos encontrar esa ubicación. Revisa el nombre e inténtalo de nuevo.');
    }
    const data = (await res.json()) as { location?: UserLocation };
    return data.location || null;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError({
      code: 'MAPS_UNAVAILABLE',
      message: 'No pudimos conectar con el servicio de búsqueda de ubicaciones.',
      status: 503,
      retryable: true,
    });
  }
}

export async function reverseGeocodeProxy(lat: number, lng: number): Promise<{
  cityName?: string;
  neighborhood?: string;
  formattedAddress?: string;
  location: UserLocation;
}> {
  try {
    const res = await fetch(`${BASE_API_URL}/api/geocode/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Reverse geocode notice:', err);
  }

  return {
    cityName: 'Tu ubicación',
    formattedAddress: `Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)}`,
    location: { lat, lng, cityName: 'Tu ubicación' },
  };
}

export async function analyzeMoodProxy(text: string): Promise<Mood> {
  const res = await fetch(`${BASE_API_URL}/api/gemini/analyze-mood`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw await parseApiError(res, 'No pudimos interpretar tu estado de ánimo en este momento.');
  }
  const data = (await res.json()) as { mood: Mood };
  return data.mood;
}

export async function generateItineraryProxy(payload: {
  criteria: SearchCriteria;
  weather: WeatherInfo | null;
  places: Plan[];
  latitude?: number;
  longitude?: number;
  searchRadiusKm?: number;
  gpsLocation?: {
    latitude: number;
    longitude: number;
    searchRadiusKm: number;
  };
}): Promise<GeneratedItinerary> {
  const lat = payload.latitude ?? payload.criteria.location?.lat;
  const lng = payload.longitude ?? payload.criteria.location?.lng;
  const radius =
    payload.searchRadiusKm ??
    payload.criteria.searchRadiusKm ??
    (payload.criteria.environment === 'Escapada' ? 15 : 5);
  const isGpsActive = Boolean(
    payload.criteria.isGpsActive || payload.criteria.location?.isGps || payload.gpsLocation
  );

  const fullPayload = {
    ...payload,
    latitude: lat,
    longitude: lng,
    searchRadiusKm: radius,
    gpsLocation: isGpsActive ? { latitude: lat, longitude: lng, searchRadiusKm: radius } : undefined,
    visitedPlaces: payload.criteria.visitedPlaces,
    userTasteProfile: payload.criteria.userTasteProfile,
  };

  let res: Response;
  try {
    res = await fetch(`${BASE_API_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullPayload),
    });
  } catch {
    throw new ApiClientError({
      code: 'NETWORK_ERROR',
      message: 'No pudimos conectar con el servidor para crear tu plan. Comprueba tu conexión e inténtalo de nuevo.',
      status: 0,
      retryable: true,
    });
  }

  if (!res.ok) {
    throw await parseApiError(
      res,
      'No se pudo generar el itinerario en este momento. Por favor, inténtalo de nuevo.'
    );
  }

  return (await res.json()) as GeneratedItinerary;
}

export async function searchPlacesProxy(
  query: string,
  location: UserLocation,
  searchRadiusKm = 5
): Promise<Plan[]> {
  let res: Response;
  try {
    res = await fetch(`${BASE_API_URL}/api/places/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, location, searchRadiusKm }),
    });
  } catch {
    throw new ApiClientError({
      code: 'MAPS_UNAVAILABLE',
      message: 'No pudimos conectar con el servicio de mapas y lugares reales.',
      status: 503,
      retryable: true,
    });
  }

  if (!res.ok) {
    throw await parseApiError(
      res,
      'No se pudieron consultar lugares verificados en esta zona.'
    );
  }

  const data = (await res.json()) as { places?: Plan[] };
  return Array.isArray(data.places) ? data.places : [];
}

export async function getWeatherProxy(location: UserLocation): Promise<WeatherInfo> {
  try {
    const res = await fetch(`${BASE_API_URL}/api/weather`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location }),
    });
    if (res.ok) {
      return (await res.json()) as WeatherInfo;
    }
  } catch (error) {
    console.warn('Weather fetch encountered network error, falling back gracefully:', error);
  }

  return {
    temp: null,
    condition: 'No disponible',
    description: 'Tiempo no disponible',
    icon: '⛅',
    alertLevel: 'unavailable',
    summary: 'Información meteorológica no disponible en este momento.',
    isAvailable: false,
  };
}

export async function computeRouteProxy(
  origin: UserLocation,
  destination: UserLocation,
  travelMode: string
): Promise<RouteInfo> {
  let res: Response;
  try {
    res = await fetch(`${BASE_API_URL}/api/routes/compute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination, travelMode }),
    });
  } catch {
    throw new ApiClientError({
      code: 'MAPS_UNAVAILABLE',
      message: 'No pudimos calcular la ruta entre paradas.',
      status: 503,
      retryable: true,
    });
  }
  if (!res.ok) {
    throw await parseApiError(res, 'Error al calcular la ruta entre paradas.');
  }
  return (await res.json()) as RouteInfo;
}

export async function generateGroupDeckProxy(params: {
  location: UserLocation;
  cityName?: string;
  mood?: string;
  environment?: string;
  budget?: string;
  searchRadiusKm?: number;
  onlyOpenNow?: boolean;
  visitedPlaces?: Array<{ id: string; name: string }>;
  userTasteProfile?: {
    summary: string;
    manualRestrictions: string[];
    recurringPreferences: string[];
    averageEnergy: number;
  };
}): Promise<{ deck: SwipeCardItem[]; cityName: string }> {
  let res: Response;
  try {
    res = await fetch(`${BASE_API_URL}/api/group/deck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        latitude: params.location.lat,
        longitude: params.location.lng,
        searchRadiusKm: params.searchRadiusKm ?? (params.environment === 'Escapada' ? 15 : 5),
        cityName: params.cityName || params.location.cityName,
      }),
    });
  } catch {
    throw new ApiClientError({
      code: 'NETWORK_ERROR',
      message: 'No pudimos conectar con el servidor para cargar los planes de grupo.',
      status: 0,
      retryable: true,
    });
  }
  if (!res.ok) {
    throw await parseApiError(
      res,
      'No se pudo preparar el mazo de planes reales para votar en grupo.'
    );
  }
  return (await res.json()) as { deck: SwipeCardItem[]; cityName: string };
}

export async function createGroupSessionProxy(session: GroupSwipeSession): Promise<{ sessionId: string }> {
  try {
    const res = await fetch(`${BASE_API_URL}/api/group/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
    if (res.ok) {
      return (await res.json()) as { sessionId: string };
    }
  } catch (err) {
    console.warn('No se pudo almacenar sesión en backend, usando enlace autocontenido:', err);
  }
  return { sessionId: session.sessionId };
}

export async function getGroupSessionProxy(sessionId: string): Promise<GroupSwipeSession | null> {
  try {
    const res = await fetch(`${BASE_API_URL}/api/group/session/${encodeURIComponent(sessionId)}`);
    if (res.ok) {
      const data = (await res.json()) as { session?: GroupSwipeSession };
      return data.session || null;
    }
  } catch (err) {
    console.warn('Fallback a payload URL al no recuperar sesión remota:', err);
  }
  return null;
}
