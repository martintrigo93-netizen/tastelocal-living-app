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

  const runQuery = async (query: string): Promise<ApiClientError | null> => {
    try {
      const results = await searchPlacesProxy(query, criteria.location, radiusKm);
      successfulSearches += 1;
      addVerifiedPlaces(results);
      return null;
    } catch (err) {
      if (err instanceof ApiClientError) {
        lastFatalError = err;
        console.warn(`Error searching places for query "${query}":`, err);
        return err;
      }
      console.warn(`Error searching places for query "${query}":`, err);
      return null;
    }
  };

  // Run primary search queries in parallel via Promise.allSettled so one failure never blocks the rest
  const parallelQueries = eventQueries.slice(0, 3);
  const settledResults =
    parallelQueries.length > 0
      ? await Promise.allSettled(parallelQueries.map((q) => runQuery(q)))
      : [];

  const firstApiError = settledResults
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .find((err): err is ApiClientError => err !== null) ?? lastFatalError;

  if (
    allPlaces.length === 0 &&
    successfulSearches === 0 &&
    firstApiError &&
    (firstApiError.code === 'RATE_LIMITED' ||
      (!firstApiError.retryable && firstApiError.status >= 400 && firstApiError.status < 500))
  ) {
    throw firstApiError;
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
        if (err.code === 'RATE_LIMITED' || (!err.retryable && err.status >= 400 && err.status < 500)) {
          throw err;
        }
      }
      console.warn('Fallback search error:', err);
    }
  }

  if (allPlaces.length === 0 && successfulSearches === 0 && lastFatalError) {
    throw lastFatalError;
  }

  return allPlaces;
}
