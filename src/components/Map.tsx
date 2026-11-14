import React, { useEffect, useRef, useState } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { type ScheduleItem } from '../types';
import { GOOGLE_MAPS_API_KEY } from '../config';
import { useAppContext } from '../context/AppContext';

interface MapProps {
  schedule: ScheduleItem[];
  showNavigationButton?: boolean;
}

import {
  getGoogleMapsNavigationUrl,
  getGoogleMapsDrivingRouteUrl,
  getGoogleMapsWalkingRouteUrl,
  getGoogleMapsFullChainedWalkingUrl,
} from '../utils/mapLinks';

export {
  getGoogleMapsNavigationUrl,
  getGoogleMapsDrivingRouteUrl,
  getGoogleMapsWalkingRouteUrl,
  getGoogleMapsFullChainedWalkingUrl,
};

function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

const RoutePolyline: React.FC<{ encodedPolyline: string }> = ({ encodedPolyline }) => {
  const map = useMap();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    const gmaps =
      typeof window !== 'undefined'
        ? (window as unknown as { google?: typeof google }).google
        : undefined;

    if (!map || !encodedPolyline || !gmaps?.maps) {
      return;
    }

    try {
      const decodedPath = decodePolyline(encodedPolyline);

      if (!polylineRef.current) {
        polylineRef.current = new gmaps.maps.Polyline({
          path: decodedPath,
          strokeColor: '#FF5E2B', // Naranja Coral
          strokeOpacity: 0.9,
          strokeWeight: 4,
          geodesic: true,
          map: map,
        });
      } else {
        polylineRef.current.setPath(decodedPath);
      }
    } catch (err) {
      console.warn('Error al dibujar la polilínea de ruta:', err);
    }

    return () => {
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
    };
  }, [map, encodedPolyline]);

  return null;
};

const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#14151b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#14151b' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8c919d' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#f3f4f6' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#7c818d' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1a2420' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#4e7b68' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#242732' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1c24' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#323647' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#212431' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#ffffff' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1c1e28' }] },
  { featureType: 'transit.station', elementType: 'labels.text.fill', stylers: [{ color: '#d1d5db' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1017' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4b5563' }] },
  { featureType: 'water', elementType: 'labels.text.stroke', stylers: [{ color: '#0d1017' }] },
];

const ItineraryMap: React.FC<MapProps> = ({ schedule }) => {
  const map = useMap();
  const { userLocation } = useAppContext();
  const [selectedMarker, setSelectedMarker] = useState<number | null>(null);
  const locationsWithCoords = schedule.filter((item) => item.location !== undefined);

  useEffect(() => {
    const gmaps =
      typeof window !== 'undefined'
        ? (window as unknown as { google?: typeof google }).google
        : undefined;

    if (!map || !gmaps?.maps) return;

    if (locationsWithCoords.length > 1) {
      const bounds = new gmaps.maps.LatLngBounds();
      locationsWithCoords.forEach((item) => {
        if (item.location) {
          bounds.extend(item.location);
        }
      });
      map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    } else if (locationsWithCoords.length === 1 && locationsWithCoords[0].location) {
      map.setCenter(locationsWithCoords[0].location);
      map.setZoom(15);
    } else if (userLocation) {
      map.setCenter(userLocation);
      map.setZoom(14);
    }
  }, [map, schedule, userLocation]);

  return (
    <>
      {userLocation && (
        <AdvancedMarker
          position={{ lat: userLocation.lat, lng: userLocation.lng }}
          title={userLocation.cityName ? `Tu ubicación: ${userLocation.cityName}` : 'Tu ubicación'}
        >
          <div className="relative flex items-center justify-center group cursor-pointer">
            <span
              className={`absolute w-8 h-8 rounded-full animate-ping pointer-events-none ${
                userLocation.isGps ? 'bg-emerald-400/30' : 'bg-[#FF5E2B]/25'
              }`}
            ></span>
            <div
              className={`w-6 h-6 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-xs transform hover:scale-110 transition ${
                userLocation.isGps
                  ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]'
                  : 'bg-[#FF5E2B] shadow-[0_0_12px_#FF5E2B]'
              }`}
            >
              📍
            </div>
            <div className="absolute -top-7 px-2 py-0.5 rounded-md bg-[#0F1015]/90 border border-white/20 text-[9px] font-bold text-white whitespace-nowrap shadow-md opacity-0 group-hover:opacity-100 transition pointer-events-none">
              {userLocation.cityName || 'Tú'} {userLocation.isGps ? '(GPS)' : ''}
            </div>
          </div>
        </AdvancedMarker>
      )}
      {locationsWithCoords.map((item, index) =>
        item.location ? (
          <AdvancedMarker
            key={(item.placeId || 'loc') + index}
            position={item.location}
            title={item.placeName}
            onClick={() => setSelectedMarker(selectedMarker === index ? null : index)}
          >
            <div className="relative group cursor-pointer">
              <div className="w-9 h-9 bg-[#FF5E2B] text-white rounded-full flex items-center justify-center font-black text-sm border-2 border-white shadow-[0_4px_16px_rgba(255,94,43,0.5)] ring-2 ring-[#FF5E2B]/40 transform hover:scale-110 transition duration-200">
                {index + 1}
              </div>

              {/* Popup info on active click or hover */}
              {selectedMarker === index && (
                <div className="absolute bottom-11 left-1/2 -translate-x-1/2 w-48 p-2.5 rounded-xl bg-[#0F1015]/95 border border-[#FF5E2B]/40 text-white shadow-2xl backdrop-blur-md z-30 pointer-events-auto">
                  <div className="flex items-center justify-between text-[10px] text-[#FF5E2B] font-bold">
                    <span>{item.time}</span>
                    <span>Parada 0{index + 1}</span>
                  </div>
                  <h6 className="text-xs font-bold truncate mt-0.5">{item.placeName}</h6>
                  <p className="text-[10px] text-gray-300 truncate">{item.activity}</p>
                </div>
              )}
            </div>
          </AdvancedMarker>
        ) : null
      )}

      {schedule.map((item, index) =>
        item.routeInfo?.encodedPolyline ? (
          <RoutePolyline
            key={`route-${index}`}
            encodedPolyline={item.routeInfo.encodedPolyline}
          />
        ) : null
      )}
    </>
  );
};

const MapComponent: React.FC<MapProps> = ({ schedule, showNavigationButton = true }) => {
  const { userLocation } = useAppContext();
  const locationsWithCoords = schedule.filter((item) => item.location !== undefined);

  // If no coordinates available at all
  if (!userLocation && locationsWithCoords.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-[#0F1015] text-gray-400">
        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 text-[#FF5E2B] flex items-center justify-center text-2xl mb-3 shadow-lg">
          📍
        </div>
        <h3 className="font-bold text-white text-sm md:text-base">Coordenadas no disponibles</h3>
        <p className="text-xs text-gray-400 max-w-xs mt-1.5 leading-relaxed">
          Selecciona una ubicación o activa la geolocalización para trazar la ruta en el mapa interactivo.
        </p>
      </div>
    );
  }

  // If Google Maps API key is not present, display dark informative fallback
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY.trim() === '') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-[#0F1015] text-gray-400">
        <div className="w-14 h-14 rounded-2xl bg-[#FF5E2B]/10 border border-[#FF5E2B]/30 text-[#FF5E2B] flex items-center justify-center text-2xl mb-3 shadow-lg">
          🗺️
        </div>
        <h3 className="font-bold text-white text-sm md:text-base">Mapa interactivo</h3>
        <p className="text-xs text-gray-400 max-w-xs mt-1.5 leading-relaxed">
          Configura <code>VITE_GOOGLE_MAPS_API_KEY</code> para visualizar el mapa en vivo. Puedes continuar consultando el itinerario cronológico paso a paso.
        </p>
      </div>
    );
  }

  // Auto-center coordinates: priority is the first scheduled stop, then user location
  const initialCenter =
    locationsWithCoords.length > 0 && locationsWithCoords[0].location
      ? locationsWithCoords[0].location
      : userLocation!;

  const navigationUrl = getGoogleMapsNavigationUrl(schedule);

  return (
    <div className="relative w-full h-full">
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <Map
          defaultCenter={initialCenter}
          defaultZoom={13}
          gestureHandling={'greedy'}
          disableDefaultUI={true}
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          className="w-full h-full"
          colorScheme="DARK"
        >
          <ItineraryMap schedule={schedule} />
        </Map>
      </APIProvider>

      {/* Accessible "Abrir ruta en Google Maps" floating action bar */}
      {showNavigationButton && schedule.length > 0 && (
        <div className="absolute bottom-4 left-4 right-4 z-20 flex justify-center pointer-events-none">
          <a
            href={navigationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto py-3 px-5 rounded-2xl font-bold text-xs uppercase tracking-wider bg-[#FF5E2B] hover:bg-[#E84D1C] text-white shadow-[0_4px_20px_rgba(255,94,43,0.4)] transition transform hover:scale-105 active:scale-95 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Abrir ruta en Google Maps</span>
          </a>
        </div>
      )}
    </div>
  );
};

export default MapComponent;

