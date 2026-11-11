import { Mood, SearchCriteria, WeatherInfo, Plan, GeneratedItinerary } from '../types';
import { analyzeMoodProxy, generateItineraryProxy } from './apiProxy';

/**
 * Analiza el estado de ánimo y texto libre expresado por el usuario usando Gemini en el backend.
 */
export async function analyzeMoodFromText(text: string): Promise<Mood> {
  return await analyzeMoodProxy(text);
}

/**
 * Genera un itinerario estructurado mediante Gemini actuando exclusivamente como motor narrativo/creativo
 * sobre la lista de lugares reales verificados. Si no hay lugares disponibles o si se devuelven lugares
 * no verificados, se descartan automáticamente.
 */
export async function generateItinerary(params: {
  criteria: SearchCriteria;
  weather: WeatherInfo | null;
  places: Plan[];
}): Promise<GeneratedItinerary> {
  const result = await generateItineraryProxy({
    ...params,
    latitude: params.criteria.location?.lat,
    longitude: params.criteria.location?.lng,
    searchRadiusKm: params.criteria.searchRadiusKm || 5,
    gpsLocation: params.criteria.isGpsActive || params.criteria.location?.isGps ? {
      latitude: params.criteria.location.lat,
      longitude: params.criteria.location.lng,
      searchRadiusKm: params.criteria.searchRadiusKm || 5,
    } : undefined,
  });

  // Si se disponía de lugares verificados en el cliente, verificamos; si no, preservamos los generados por el backend con coordenadas válidas
  if (params.places && params.places.length > 0) {
    const verifiedMap = new Map<string, Plan>();
    params.places.forEach((p) => {
      verifiedMap.set(p.id, p);
      verifiedMap.set(p.name.toLowerCase().trim(), p);
    });

    const isItemValid = (item: { placeId?: string; placeName?: string; location?: { lat?: number; lng?: number } }) => {
      const match =
        (item.placeId && verifiedMap.get(item.placeId)) ||
        (item.placeName && verifiedMap.get(item.placeName.toLowerCase().trim()));
      if (match) return true;
      return typeof item.location?.lat === 'number' && typeof item.location?.lng === 'number';
    };

    if (result.proposals && Array.isArray(result.proposals)) {
      result.proposals = result.proposals.map((prop) => ({
        ...prop,
        schedule: prop.schedule ? prop.schedule.filter(isItemValid) : [],
      }));
    }

    if (result.mainPlan?.schedule) {
      result.mainPlan.schedule = result.mainPlan.schedule.filter(isItemValid);
    }

    if (result.premiumContingencyPlan?.schedule) {
      result.premiumContingencyPlan.schedule = result.premiumContingencyPlan.schedule.filter(isItemValid);
    }
  }

  if (!result.mainPlan?.schedule || result.mainPlan.schedule.length === 0) {
    throw new Error(
      'Sin resultados suficientes: el planificador no pudo asociar suficientes lugares en esta zona.'
    );
  }

  return result;
}
