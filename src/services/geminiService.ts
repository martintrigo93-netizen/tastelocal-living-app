import { Mood, SearchCriteria, WeatherInfo, Plan, GeneratedItinerary } from '../types';
import { analyzeMoodProxy, generateItineraryProxy, ApiClientError } from './apiProxy';

const SYNTHETIC_ID_PATTERN = /^(poi-|resilient-poi-|gemini-poi-|group-card-)/i;

function isVerifiedItem(
  item: { placeId?: string; placeName?: string; verifiedSource?: string },
  verifiedMap: Map<string, Plan>
): boolean {
  const id = String(item.placeId || '').trim();
  const nameKey = String(item.placeName || '').toLowerCase().trim();
  if (!id || SYNTHETIC_ID_PATTERN.test(id)) {
    return false;
  }

  if (verifiedMap.size > 0) {
    if (verifiedMap.has(id) || (nameKey && verifiedMap.has(nameKey))) {
      return true;
    }
  }

  return item.verifiedSource === 'google_places' || item.verifiedSource === 'openstreetmap';
}

/**
 * Analiza el estado de ánimo y texto libre expresado por el usuario usando Gemini en el backend.
 */
export async function analyzeMoodFromText(text: string): Promise<Mood> {
  return await analyzeMoodProxy(text);
}

/**
 * Genera un itinerario estructurado mediante Gemini actuando exclusivamente como motor narrativo/creativo
 * sobre lugares reales verificados (Google Places / OpenStreetMap). Cualquier ítem sin identificador verificable
 * se descarta automáticamente.
 */
export async function generateItinerary(params: {
  criteria: SearchCriteria;
  weather: WeatherInfo | null;
  places: Plan[];
}): Promise<GeneratedItinerary> {
  const radiusKm =
    params.criteria.searchRadiusKm || (params.criteria.environment === 'Escapada' ? 15 : 5);

  const result = await generateItineraryProxy({
    ...params,
    latitude: params.criteria.location?.lat,
    longitude: params.criteria.location?.lng,
    searchRadiusKm: radiusKm,
    gpsLocation:
      params.criteria.isGpsActive || params.criteria.location?.isGps
        ? {
            latitude: params.criteria.location.lat,
            longitude: params.criteria.location.lng,
            searchRadiusKm: radiusKm,
          }
        : undefined,
  });

  const verifiedMap = new Map<string, Plan>();
  (params.places || []).forEach((p) => {
    verifiedMap.set(p.id, p);
    verifiedMap.set(p.name.toLowerCase().trim(), p);
  });

  if (result.proposals && Array.isArray(result.proposals)) {
    result.proposals = result.proposals
      .map((prop) => ({
        ...prop,
        schedule: prop.schedule
          ? prop.schedule.filter((item) => isVerifiedItem(item, verifiedMap))
          : [],
      }))
      .filter((prop) => prop.schedule.length > 0);
  }

  if (result.mainPlan?.schedule) {
    result.mainPlan.schedule = result.mainPlan.schedule.filter((item) =>
      isVerifiedItem(item, verifiedMap)
    );
  }

  if (result.premiumContingencyPlan?.schedule) {
    result.premiumContingencyPlan.schedule = result.premiumContingencyPlan.schedule.filter((item) =>
      isVerifiedItem(item, verifiedMap)
    );
  }

  if (!result.mainPlan?.schedule || result.mainPlan.schedule.length === 0) {
    throw new ApiClientError({
      code: radiusKm < 15 ? 'NO_VERIFIED_PLACES_IN_RADIUS' : 'NO_VERIFIED_PLACES',
      message:
        radiusKm < 15
          ? `No encontramos suficientes lugares verificados en un radio de ${radiusKm} km. Prueba ampliar el radio a 15 km.`
          : 'No pudimos verificar lugares reales suficientes con esas preferencias en esta ubicación.',
      status: 404,
      retryable: false,
      suggestedRadiusKm: radiusKm < 15 ? 15 : undefined,
    });
  }

  return result;
}
