import { type ScheduleItem } from '../types';

export function getGoogleMapsNavigationUrl(
  schedule: ScheduleItem[],
  travelMode: 'walking' | 'driving' = 'walking'
): string {
  const validStops = schedule.filter((s) => s.placeName);
  if (validStops.length === 0) return 'https://www.google.com/maps';

  if (validStops.length === 1) {
    const stop = validStops[0];
    const query = stop.location
      ? `${stop.location.lat},${stop.location.lng}`
      : `${stop.placeName} ${stop.placeAddress || ''}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  const firstStop = validStops[0];
  const lastStop = validStops[validStops.length - 1];

  const origin = firstStop.location
    ? `${firstStop.location.lat},${firstStop.location.lng}`
    : encodeURIComponent(firstStop.placeName);

  const destination = lastStop.location
    ? `${lastStop.location.lat},${lastStop.location.lng}`
    : encodeURIComponent(lastStop.placeName);

  const waypoints = validStops
    .slice(1, -1)
    .map((s) => (s.location ? `${s.location.lat},${s.location.lng}` : encodeURIComponent(s.placeName)))
    .filter(Boolean)
    .join('|');

  const waypointsParam = waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '';
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointsParam}&travelmode=${travelMode}`;
}

export function getGoogleMapsDrivingRouteUrl(schedule: ScheduleItem[]): string {
  return getGoogleMapsNavigationUrl(schedule, 'driving');
}

export function getGoogleMapsWalkingRouteUrl(schedule: ScheduleItem[]): string {
  return getGoogleMapsNavigationUrl(schedule, 'walking');
}

/**
 * Genera la URL oficial de Google Maps Directions para la Ruta Encadenada de 3 paradas en modo peatonal:
 * - Origen: Ubicación del usuario o Parada 1
 * - Waypoints: Parada 2 (e intermedias)
 * - Destino: Parada 3 (última parada)
 * - travelmode=walking
 */
export function getGoogleMapsFullChainedWalkingUrl(
  schedule: ScheduleItem[],
  userLocation?: { lat: number; lng: number } | null
): string {
  const validStops = schedule.filter((s) => s.placeName);
  if (validStops.length === 0) return 'https://www.google.com/maps';

  if (validStops.length === 1) {
    const stop = validStops[0];
    const destination = stop.location
      ? `${stop.location.lat},${stop.location.lng}`
      : encodeURIComponent(`${stop.placeName} ${stop.placeAddress || ''}`);
    const originParam = userLocation?.lat && userLocation?.lng
      ? `&origin=${userLocation.lat},${userLocation.lng}`
      : '';
    return `https://www.google.com/maps/dir/?api=1${originParam}&destination=${destination}&travelmode=walking`;
  }

  const lastStop = validStops[validStops.length - 1];
  const destination = lastStop.location
    ? `${lastStop.location.lat},${lastStop.location.lng}`
    : encodeURIComponent(lastStop.placeName);

  let origin = '';
  let waypointsList: string[] = [];

  if (userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number') {
    origin = `${userLocation.lat},${userLocation.lng}`;
    waypointsList = validStops
      .slice(0, -1)
      .map((s) => (s.location ? `${s.location.lat},${s.location.lng}` : encodeURIComponent(s.placeName)));
  } else {
    const firstStop = validStops[0];
    origin = firstStop.location
      ? `${firstStop.location.lat},${firstStop.location.lng}`
      : encodeURIComponent(firstStop.placeName);
    waypointsList = validStops
      .slice(1, -1)
      .map((s) => (s.location ? `${s.location.lat},${s.location.lng}` : encodeURIComponent(s.placeName)));
  }

  const waypointsParam =
    waypointsList.length > 0 ? `&waypoints=${encodeURIComponent(waypointsList.join('|'))}` : '';

  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointsParam}&travelmode=walking`;
}
