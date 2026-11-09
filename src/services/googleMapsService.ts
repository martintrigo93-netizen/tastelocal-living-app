import { SearchCriteria, Plan } from '../types';
import { searchPlacesProxy } from './apiProxy';

export async function findPotentialPlaces(
  criteria: SearchCriteria,
  eventQueries: string[]
): Promise<Plan[]> {
  const allPlaces: Plan[] = [];
  const seenPlaceIds = new Set<string>();

  // Run place searches for queries
  for (const query of eventQueries.slice(0, 3)) {
    try {
      const results = await searchPlacesProxy(query, criteria.location);
      for (const place of results) {
        if (!seenPlaceIds.has(place.id)) {
          seenPlaceIds.add(place.id);
          allPlaces.push(place);
        }
      }
    } catch (err) {
      console.warn(`Error searching places for query "${query}":`, err);
    }
  }

  // If few places returned, run a fallback nearby search for general interesting spots
  if (allPlaces.length < 3) {
    try {
      const fallbackResults = await searchPlacesProxy(
        `${criteria.environment} lugares de interés`,
        criteria.location
      );
      for (const place of fallbackResults) {
        if (!seenPlaceIds.has(place.id)) {
          seenPlaceIds.add(place.id);
          allPlaces.push(place);
        }
      }
    } catch (err) {
      console.warn('Fallback search error:', err);
    }
  }

  return allPlaces;
}
