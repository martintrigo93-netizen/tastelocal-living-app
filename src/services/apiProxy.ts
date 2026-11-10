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
  const res = await fetch(`${BASE_API_URL}/api/gemini/generate-itinerary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || 'No se pudo generar el itinerario');
  }
  return (await res.json()) as GeneratedItinerary;
}

export async function searchPlacesProxy(query: string, location: UserLocation): Promise<Plan[]> {
  const res = await fetch(`${BASE_API_URL}/api/places/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, location }),
  });
  if (!res.ok) {
    const errData = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(errData.error || 'Error al buscar lugares');
  }
  const data = (await res.json()) as { places?: Plan[] };
  return data.places || [];
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
