import { GeneratedItinerary, ProposalPlan, ScheduleItem, WeatherInfo } from '../types';
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

function getWeatherAlertSummary(weather?: WeatherInfo | null): string | undefined {
  return weather && weather.isAvailable && weather.alertLevel !== 'clear' && weather.alertLevel !== 'unavailable'
    ? `Condición: ${weather.summary}`
    : undefined;
}

async function enrichScheduleStops(
  schedule: ScheduleItem[],
  travelMode: 'WALKING' | 'TRANSIT' | 'DRIVING' | 'BICYCLING',
  weatherAlert: string | undefined,
  legCache: Map<string, Promise<NonNullable<ScheduleItem['routeInfo']>>>
): Promise<ScheduleItem[]> {
  const cloned = schedule.map((s) => ({ ...s }));
  let abortRemoteRoutes = false;

  const resolveLeg = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const key = `${lat1.toFixed(5)},${lng1.toFixed(5)}->${lat2.toFixed(5)},${lng2.toFixed(5)}|${travelMode}|${weatherAlert ? 'w' : 'n'}`;
    const existing = legCache.get(key);
    if (existing) return existing;

    const promise = (async () => {
      if (abortRemoteRoutes) {
        return computeLocalFallbackRoute(lat1, lng1, lat2, lng2, travelMode, weatherAlert);
      }
      try {
        const routeData = await computeRouteProxy(
          { lat: lat1, lng: lng1 },
          { lat: lat2, lng: lng2 },
          travelMode
        );
        return {
          duration: routeData.duration || '15 min aprox.',
          distance: routeData.distance || '1.2 km',
          travelMode,
          encodedPolyline: routeData.encodedPolyline,
          weatherAlert,
          suggestedPois: routeData.suggestedPois || [],
        };
      } catch (err) {
        if (err instanceof ApiClientError && (err.code === 'RATE_LIMITED' || !err.retryable)) {
          abortRemoteRoutes = true;
        }
        console.warn('Could not compute route between stops:', err);
        return computeLocalFallbackRoute(lat1, lng1, lat2, lng2, travelMode, weatherAlert);
      }
    })();

    legCache.set(key, promise);
    return promise;
  };

  const tasks: Promise<void>[] = [];
  for (let i = 1; i < cloned.length; i++) {
    const prevStop = cloned[i - 1];
    const currentStop = cloned[i];
    if (prevStop.location && currentStop.location && !currentStop.routeInfo) {
      tasks.push(
        resolveLeg(
          prevStop.location.lat,
          prevStop.location.lng,
          currentStop.location.lat,
          currentStop.location.lng
        ).then((info) => {
          currentStop.routeInfo = info;
        })
      );
    }
  }

  await Promise.all(tasks);
  return cloned;
}

export async function enrichProposalWithRoutes(
  proposal: ProposalPlan,
  travelMode: 'WALKING' | 'TRANSIT' | 'DRIVING' | 'BICYCLING',
  weather?: WeatherInfo | null,
  includeWeatherAlert = false
): Promise<ProposalPlan> {
  const weatherAlert = includeWeatherAlert ? getWeatherAlertSummary(weather) : undefined;
  const legCache = new Map<string, Promise<NonNullable<ScheduleItem['routeInfo']>>>();
  const schedule = await enrichScheduleStops(proposal.schedule, travelMode, weatherAlert, legCache);
  return {
    ...proposal,
    schedule,
  };
}

export async function enrichItineraryWithRoutes(
  itinerary: GeneratedItinerary,
  travelMode: 'WALKING' | 'TRANSIT' | 'DRIVING' | 'BICYCLING',
  weather?: WeatherInfo | null,
  options?: { onlyPrimaryPlan?: boolean }
): Promise<GeneratedItinerary> {
  const onlyPrimaryPlan = Boolean(options?.onlyPrimaryPlan);
  const weatherAlert = getWeatherAlertSummary(weather);
  const legCache = new Map<string, Promise<NonNullable<ScheduleItem['routeInfo']>>>();

  const enrichedItinerary: GeneratedItinerary = {
    ...itinerary,
    mainPlan: {
      ...itinerary.mainPlan,
      schedule: itinerary.mainPlan.schedule.map((s) => ({ ...s })),
    },
    ...(itinerary.premiumContingencyPlan
      ? {
          premiumContingencyPlan: {
            ...itinerary.premiumContingencyPlan,
            schedule: itinerary.premiumContingencyPlan.schedule.map((s) => ({ ...s })),
          },
        }
      : {}),
    ...(itinerary.proposals && Array.isArray(itinerary.proposals)
      ? {
          proposals: itinerary.proposals.map((prop) => ({
            ...prop,
            schedule: prop.schedule.map((s) => ({ ...s })),
          })),
        }
      : {}),
  };

  const tasks: Promise<void>[] = [
    enrichScheduleStops(enrichedItinerary.mainPlan.schedule, travelMode, weatherAlert, legCache).then(
      (schedule) => {
        enrichedItinerary.mainPlan.schedule = schedule;
      }
    ),
  ];

  if (enrichedItinerary.proposals && enrichedItinerary.proposals.length > 0) {
    const proposalsToEnrich = onlyPrimaryPlan
      ? [enrichedItinerary.proposals[0]]
      : enrichedItinerary.proposals;

    proposalsToEnrich.forEach((prop, index) => {
      tasks.push(
        enrichScheduleStops(
          prop.schedule,
          travelMode,
          index === 0 ? weatherAlert : undefined,
          legCache
        ).then((schedule) => {
          prop.schedule = schedule;
        })
      );
    });
  }

  if (!onlyPrimaryPlan && enrichedItinerary.premiumContingencyPlan) {
    tasks.push(
      enrichScheduleStops(
        enrichedItinerary.premiumContingencyPlan.schedule,
        travelMode,
        undefined,
        legCache
      ).then((schedule) => {
        if (enrichedItinerary.premiumContingencyPlan) {
          enrichedItinerary.premiumContingencyPlan.schedule = schedule;
        }
      })
    );
  }

  await Promise.all(tasks);
  return enrichedItinerary;
}
