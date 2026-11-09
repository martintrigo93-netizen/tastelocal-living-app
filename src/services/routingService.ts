import { GeneratedItinerary, WeatherInfo } from '../types';
import { computeRouteProxy } from './apiProxy';

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

  const schedule = enrichedItinerary.mainPlan.schedule;

  for (let i = 1; i < schedule.length; i++) {
    const prevStop = schedule[i - 1];
    const currentStop = schedule[i];

    if (prevStop.location && currentStop.location) {
      try {
        const routeData = await computeRouteProxy(
          prevStop.location,
          currentStop.location,
          travelMode
        );

        let weatherAlert: string | undefined = undefined;
        if (weather && weather.isAvailable && weather.alertLevel !== 'clear' && weather.alertLevel !== 'unavailable') {
          weatherAlert = `Condición: ${weather.summary}`;
        }

        currentStop.routeInfo = {
          duration: routeData.duration || '15 min aprox.',
          distance: routeData.distance || '1.2 km',
          travelMode,
          encodedPolyline: routeData.encodedPolyline,
          weatherAlert,
          suggestedPois: routeData.suggestedPois || [],
        };
      } catch (err) {
        console.warn(`Could not compute route between stop ${i - 1} and ${i}:`, err);
        const latDiff = (currentStop.location.lat - prevStop.location.lat) * 111;
        const lngDiff = (currentStop.location.lng - prevStop.location.lng) * 85;
        const distKm = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
        const approxMin = Math.max(5, Math.round(distKm * (travelMode === 'WALKING' ? 12 : 3)));

        currentStop.routeInfo = {
          duration: `${approxMin} min aprox.`,
          distance: `${distKm.toFixed(1)} km`,
          travelMode,
          suggestedPois: [],
        };
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
        } catch {
          // ignore error for contingency plan
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
          } catch {
            const latDiff = (currentStop.location.lat - prevStop.location.lat) * 111;
            const lngDiff = (currentStop.location.lng - prevStop.location.lng) * 85;
            const distKm = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
            const approxMin = Math.max(5, Math.round(distKm * (travelMode === 'WALKING' ? 12 : 3)));
            currentStop.routeInfo = {
              duration: `${approxMin} min aprox.`,
              distance: `${distKm.toFixed(1)} km`,
              travelMode,
              suggestedPois: [],
            };
          }
        }
      }
    }
  }

  return enrichedItinerary;
}
