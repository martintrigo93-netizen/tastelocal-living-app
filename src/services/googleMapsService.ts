import { SearchCriteria, Plan } from '../types';
import { searchPlacesProxy, ApiClientError } from './apiProxy';

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

export async function findPotentialPlaces(
  criteria: SearchCriteria,
  eventQueries: string[]
): Promise<Plan[]> {
  const allPlaces: Plan[] = [];
  const seenPlaceIds = new Set<string>();
  const radiusKm =
    criteria.searchRadiusKm || (criteria.environment === 'Escapada' ? 15 : 5);

  let lastFatalError: ApiClientError | null = null;
  let successfulSearches = 0;

  const addVerifiedPlaces = (results: Plan[]) => {
    for (const place of results) {
      if (!place?.id || !place.location) continue;
      if (typeof place.location.lat !== 'number' || typeof place.location.lng !== 'number') continue;
      const dist = haversineDistanceKm(
        criteria.location.lat,
        criteria.location.lng,
        place.location.lat,
        place.location.lng
      );
      if (dist > radiusKm) continue;
      if (!seenPlaceIds.has(place.id)) {
        seenPlaceIds.add(place.id);
        allPlaces.push(place);
      }
    }
  };

  for (const query of eventQueries.slice(0, 3)) {
    try {
      const results = await searchPlacesProxy(query, criteria.location, radiusKm);
      successfulSearches += 1;
      addVerifiedPlaces(results);
      if (allPlaces.length >= 10) break;
    } catch (err) {
      if (err instanceof ApiClientError) {
        lastFatalError = err;
        // Stop immediately on rate limit so we never trigger a retry storm
        if (err.code === 'RATE_LIMITED') {
          throw err;
        }
      }
      console.warn(`Error searching places for query "${query}":`, err);
    }
  }

  // Fallback contextual query if fewer than 3 real places were gathered and service is responsive
  if (allPlaces.length < 3 && (successfulSearches > 0 || !lastFatalError)) {
    try {
      const fallbackResults = await searchPlacesProxy(
        `${criteria.environment} lugares de interés`,
        criteria.location,
        radiusKm
      );
      successfulSearches += 1;
      addVerifiedPlaces(fallbackResults);
    } catch (err) {
      if (err instanceof ApiClientError) {
        lastFatalError = err;
        if (err.code === 'RATE_LIMITED') throw err;
      }
      console.warn('Fallback search error:', err);
    }
  }

  if (allPlaces.length === 0 && successfulSearches === 0 && lastFatalError) {
    throw lastFatalError;
  }

  return allPlaces;
}
