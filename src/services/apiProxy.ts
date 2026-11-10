import {
  UserLocation,
  Mood,
  SearchCriteria,
  WeatherInfo,
  Plan,
  GeneratedItinerary,
  RouteInfo,
} from '../types';

const BASE_API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export async function geocodeAddressProxy(query: string): Promise<UserLocation | null> {
  try {
    const res = await fetch(`${BASE_API_URL}/api/places/geocode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errData.error || 'No se pudo geolocalizar la dirección');
    }
    const data = (await res.json()) as { location?: UserLocation };
    return data.location || null;
  } catch (error) {
    console.error('Error en geocodeAddressProxy:', error);
    throw error;
  }
}

export async function analyzeMoodProxy(text: string): Promise<Mood> {
  const res = await fetch(`${BASE_API_URL}/api/gemini/analyze-mood`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const errData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || 'Error al analizar el estado de ánimo');
  }
  const data = (await res.json()) as { mood: Mood };
  return data.mood;
}

export async function generateItineraryProxy(payload: {
  criteria: SearchCriteria;
  weather: WeatherInfo | null;
  places: Plan[];
}): Promise<GeneratedItinerary> {
  try {
    const res = await fetch(`${BASE_API_URL}/api/gemini/generate-itinerary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return (await res.json()) as GeneratedItinerary;
    }
  } catch (err) {
    console.warn('Initial generate itinerary endpoint attempt notice, trying /api/generate fallback:', err);
  }

  // Fallback to /api/generate
  try {
    const fallbackRes = await fetch(`${BASE_API_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (fallbackRes.ok) {
      return (await fallbackRes.json()) as GeneratedItinerary;
    }
  } catch (err2) {
    console.warn('Fallback /api/generate route error:', err2);
  }

  throw new Error('No se pudo generar el itinerario en este momento. Por favor, inténtalo de nuevo.');
}

export async function searchPlacesProxy(query: string, location: UserLocation): Promise<Plan[]> {
  try {
    const res = await fetch(`${BASE_API_URL}/api/places/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, location }),
    });
    if (res.ok) {
      const data = (await res.json()) as { places?: Plan[] };
      if (Array.isArray(data.places)) return data.places;
    }
  } catch (err) {
    console.warn('Places search primary route notice, trying /api/places:', err);
  }

  try {
    const fallbackRes = await fetch(`${BASE_API_URL}/api/places`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, location }),
    });
    if (fallbackRes.ok) {
      const data = (await fallbackRes.json()) as { places?: Plan[] };
      return data.places || [];
    }
  } catch (err2) {
    console.warn('Fallback /api/places route notice:', err2);
  }

  return [];
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

  // Graceful degradation: weather unavailable
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
  const res = await fetch(`${BASE_API_URL}/api/routes/compute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination, travelMode }),
  });
  if (!res.ok) {
    const errData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || 'Error al calcular la ruta');
  }
  return (await res.json()) as RouteInfo;
}
