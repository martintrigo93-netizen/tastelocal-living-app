import { UserLocation } from '../types';
import { reverseGeocodeProxy } from './apiProxy';

const STORAGE_LAST_LOCATION_KEY = 'tastelocal_last_location';

export type GeolocationStatus =
  | 'idle'
  | 'locating'
  | 'granted'
  | 'denied'
  | 'error'
  | 'unsupported';

export interface GeolocationResult {
  status: GeolocationStatus;
  location: UserLocation | null;
  errorMessage?: string;
  source: 'gps' | 'cache' | 'default';
}

/**
 * Recupera la última ubicación guardada en localStorage.
 */
export function getLastSavedLocation(): UserLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_LAST_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
      return parsed as UserLocation;
    }
  } catch (err) {
    console.warn('Error al leer tastelocal_last_location de localStorage:', err);
  }
  return null;
}

/**
 * Guarda una ubicación en localStorage para recordar la última selección.
 */
export function saveLastLocation(location: UserLocation): void {
  try {
    localStorage.setItem(STORAGE_LAST_LOCATION_KEY, JSON.stringify(location));
  } catch (err) {
    console.warn('Error al guardar tastelocal_last_location en localStorage:', err);
  }
}

/**
 * Solicita la posición GPS actual utilizando la Geolocation API del navegador y
 * realiza geocodificación inversa para identificar con precisión la localidad y el barrio.
 */
export async function requestCurrentLocation(
  onProgressMessage?: (msg: string) => void
): Promise<GeolocationResult> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    const cached = getLastSavedLocation();
    return {
      status: 'unsupported',
      location: cached,
      errorMessage: 'Tu navegador o dispositivo no cuenta con soporte para GPS nativo.',
      source: cached ? 'cache' : 'default',
    };
  }

  onProgressMessage?.('Conectando con el sensor GPS de tu dispositivo...');

  return new Promise<GeolocationResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        onProgressMessage?.('Identificando localidad y barrio en tiempo real...');

        try {
          // Geocodificación inversa para obtener el municipio real y barrio
          const rev = await reverseGeocodeProxy(lat, lng);

          const finalLocation: UserLocation = {
            lat,
            lng,
            cityName: rev.cityName || 'Ubicación actual',
            neighborhood: rev.neighborhood,
            formattedAddress: rev.formattedAddress || `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`,
            isGps: true,
            accuracyMeters: Math.round(accuracy),
          };

          // Guardar en localStorage para recordar
          saveLastLocation(finalLocation);

          resolve({
            status: 'granted',
            location: finalLocation,
            source: 'gps',
          });
        } catch (revErr) {
          console.warn('Error en geocodificación inversa, usando coordenadas directas:', revErr);
          const fallbackGpsLocation: UserLocation = {
            lat,
            lng,
            cityName: 'Ubicación GPS',
            formattedAddress: `Coordenadas: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
            isGps: true,
            accuracyMeters: Math.round(accuracy),
          };
          saveLastLocation(fallbackGpsLocation);

          resolve({
            status: 'granted',
            location: fallbackGpsLocation,
            source: 'gps',
          });
        }
      },
      (error) => {
        console.warn('Geolocation error:', error);
        const cached = getLastSavedLocation();

        if (error.code === error.PERMISSION_DENIED) {
          resolve({
            status: 'denied',
            location: cached,
            errorMessage: 'Permiso de ubicación no concedido en tu navegador o móvil.',
            source: cached ? 'cache' : 'default',
          });
          return;
        }

        let message = 'No se pudo obtener la señal GPS con suficiente precisión.';
        if (error.code === error.TIMEOUT) {
          message = 'Tiempo de espera agotado al conectar con el GPS.';
        }

        resolve({
          status: 'error',
          location: cached,
          errorMessage: message,
          source: cached ? 'cache' : 'default',
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 9000,
        maximumAge: 15000,
      }
    );
  });
}
