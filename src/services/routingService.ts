import { GeneratedItinerary, WeatherInfo } from '../types';
import { computeRouteProxy, ApiClientError } from './apiProxy';

function computeLocalFallbackRoute(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  travelMode: 'WALKING' | 'TRANSIT' | 'DRIVING' | 'BICYCLING',
  weatherAlert?: string
) {
  const latDiff = (lat2 - lat1) * 111;
  const lngDiff = (lng2 - lng1) * 85;
  const distKm = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
  const approxMin = Math.max(5, Math.round(distKm * (travelMode === 'WALKING' ? 12 : 3)));
  return {
    duration: `${approxMin} min aprox.`,
    distance: `${distKm.toFixed(1)} km`,
    travelMode,
    weatherAlert,
    suggestedPois: [],
  };
}

export async function enrichItineraryWithRoutes(
  itinerary: GeneratedItinerary,
  travelMode: 'WALKING' | 'TRANSIT' | 'DRIVING' | 'BICYCLING',
  weather?: WeatherInfo | null
): Promise<GeneratedItinerary> {
  const enrichedItinerary: GeneratedItinerary = {
    ...itinerary,
    mainPlan: {
      ...itinerary.mainPlan,
      schedule: [...itinerary.mainPlan.schedule],
    },
  };

  let rateLimited = false;
  const weatherAlert =
    weather && weather.isAvailable && weather.alertLevel !== 'clear' && weather.alertLevel !== 'unavailable'
      ? `Condición: ${weather.summary}`
      : undefined;

  const schedule = enrichedItinerary.mainPlan.schedule;

  for (let i = 1; i < schedule.length; i++) {
    const prevStop = schedule[i - 1];
    const currentStop = schedule[i];

    if (prevStop.location && currentStop.location) {
      if (rateLimited) {
        currentStop.routeInfo = computeLocalFallbackRoute(
          prevStop.location.lat,
          prevStop.location.lng,
          currentStop.location.lat,
          currentStop.location.lng,
          travelMode,
          weatherAlert
        );
        continue;
      }

      try {
        const routeData = await computeRouteProxy(
          prevStop.location,
          currentStop.location,
          travelMode
        );

        currentStop.routeInfo = {
          duration: routeData.duration || '15 min aprox.',
          distance: routeData.distance || '1.2 km',
          travelMode,
          encodedPolyline: routeData.encodedPolyline,
          weatherAlert,
          suggestedPois: routeData.suggestedPois || [],
        };
      } catch (err) {
        if (err instanceof ApiClientError && err.code === 'RATE_LIMITED') {
          rateLimited = true;
        }
        console.warn(`Could not compute route between stop ${i - 1} and ${i}:`, err);
        currentStop.routeInfo = computeLocalFallbackRoute(
          prevStop.location.lat,
          prevStop.location.lng,
          currentStop.location.lat,
          currentStop.location.lng,
          travelMode,
          weatherAlert
        );
      }
    }
  }

  // Also enrich contingency plan if available
  if (enrichedItinerary.premiumContingencyPlan) {
    enrichedItinerary.premiumContingencyPlan = {
      ...enrichedItinerary.premiumContingencyPlan,
      schedule: [...enrichedItinerary.premiumContingencyPlan.schedule],
    };
    const cSchedule = enrichedItinerary.premiumContingencyPlan.schedule;
    for (let i = 1; i < cSchedule.length; i++) {
      const prevStop = cSchedule[i - 1];
      const currentStop = cSchedule[i];
      if (prevStop.location && currentStop.location) {
        if (rateLimited) {
          currentStop.routeInfo = computeLocalFallbackRoute(
            prevStop.location.lat,
            prevStop.location.lng,
            currentStop.location.lat,
            currentStop.location.lng,
            travelMode
          );
          continue;
        }
        try {
          const routeData = await computeRouteProxy(
            prevStop.location,
            currentStop.location,
            travelMode
          );
          currentStop.routeInfo = {
            duration: routeData.duration || '15 min aprox.',
            distance: routeData.distance || '1 km',
            travelMode,
            encodedPolyline: routeData.encodedPolyline,
            suggestedPois: [],
          };
        } catch (err) {
          if (err instanceof ApiClientError && err.code === 'RATE_LIMITED') {
            rateLimited = true;
          }
          currentStop.routeInfo = computeLocalFallbackRoute(
            prevStop.location.lat,
            prevStop.location.lng,
            currentStop.location.lat,
            currentStop.location.lng,
            travelMode
          );
        }
      }
    }
  }

  // Enrich all proposals routes
  if (enrichedItinerary.proposals && Array.isArray(enrichedItinerary.proposals)) {
    for (const prop of enrichedItinerary.proposals) {
      const pSchedule = prop.schedule;
      for (let i = 1; i < pSchedule.length; i++) {
        const prevStop = pSchedule[i - 1];
        const currentStop = pSchedule[i];
        if (prevStop.location && currentStop.location) {
          if (rateLimited) {
            currentStop.routeInfo = computeLocalFallbackRoute(
              prevStop.location.lat,
              prevStop.location.lng,
              currentStop.location.lat,
              currentStop.location.lng,
              travelMode
            );
            continue;
          }
          try {
            const routeData = await computeRouteProxy(
              prevStop.location,
              currentStop.location,
              travelMode
            );
            currentStop.routeInfo = {
              duration: routeData.duration || '12 min aprox.',
              distance: routeData.distance || '1 km',
              travelMode,
              encodedPolyline: routeData.encodedPolyline,
              suggestedPois: [],
            };
          } catch (err) {
            if (err instanceof ApiClientError && err.code === 'RATE_LIMITED') {
              rateLimited = true;
            }
            currentStop.routeInfo = computeLocalFallbackRoute(
              prevStop.location.lat,
              prevStop.location.lng,
              currentStop.location.lat,
              currentStop.location.lng,
              travelMode
            );
          }
        }
      }
    }
  }

  return enrichedItinerary;
}
