import React, { useEffect, useRef } from 'react';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { type ScheduleItem } from '../types';
import { GOOGLE_MAPS_API_KEY } from '../config';
import { useAppContext } from '../context/AppContext';

interface MapProps {
    schedule: ScheduleItem[];
}

/**
 * Componente que renderiza una polilínea en el mapa a partir de una
 * cadena codificada de la API de Google Directions.
 */
const RoutePolyline: React.FC<{ encodedPolyline: string }> = ({ encodedPolyline }) => {
    const map = useMap();
    const polylineRef = useRef<any | null>(null);

    useEffect(() => {
        const gmaps = (window as any).google;
        if (!map || !encodedPolyline || !gmaps?.maps?.geometry?.encoding) {
            return;
        }

        // Decodificar la polilínea para obtener el path
        const decodedPath = gmaps.maps.geometry.encoding.decodePath(encodedPolyline);

        if (!polylineRef.current) {
            polylineRef.current = new gmaps.maps.Polyline({
                path: decodedPath,
                strokeColor: '#4F46E5', // Indigo-600
                strokeOpacity: 0.8,
                strokeWeight: 5,
                geodesic: true,
                map: map,
            });
        } else {
            polylineRef.current.setPath(decodedPath);
        }
        
        return () => {
            polylineRef.current?.setMap(null);
            polylineRef.current = null;
        };
    }, [map, encodedPolyline]);

    return null; // Este componente no renderiza DOM
};


const ItineraryMap: React.FC<MapProps> = ({ schedule }) => {
    const map = useMap();
    const locationsWithCoords = schedule.filter(item => item.location);

    useEffect(() => {
        const gmaps = (window as any).google;
        if (!map || locationsWithCoords.length === 0 || !gmaps) return;

        if (locationsWithCoords.length === 1) {
            map.setCenter(locationsWithCoords[0].location!);
            map.setZoom(15);
        } else {
            const bounds = new gmaps.maps.LatLngBounds();
            locationsWithCoords.forEach(item => bounds.extend(item.location!));
            map.fitBounds(bounds, 100); // 100px de padding
        }
    }, [map, locationsWithCoords]); // Dependencia clave: re-centrar si los puntos cambian

    return (
        <>
            {locationsWithCoords.map((item, index) => (
                <AdvancedMarker
                    key={item.placeId + index}
                    position={item.location}
                    title={item.placeName}
                >
                    <div className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-lg border-2 border-white shadow-md">
                        {index + 1}
                    </div>
                </AdvancedMarker>
            ))}
            {/* Renderizar la polilínea de la ruta real si existe */}
            {schedule.map((item, index) => 
                item.routeInfo?.encodedPolyline ? (
                    <RoutePolyline key={`route-${index}`} encodedPolyline={item.routeInfo.encodedPolyline} />
                ) : null
            )}
        </>
    );
};


const MapComponent: React.FC<MapProps> = ({ schedule }) => {
    const { userLocation } = useAppContext();

    const initialCenter = userLocation || { lat: 40.416775, lng: -3.703790 };

    return (
        <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
            <Map
                defaultCenter={initialCenter}
                defaultZoom={12}
                gestureHandling={'greedy'}
                disableDefaultUI={true}
                mapId="tasteLocalMap"
                className="w-full h-full"
            >
                <ItineraryMap schedule={schedule} />
            </Map>
        </APIProvider>
    );
};

export default MapComponent;