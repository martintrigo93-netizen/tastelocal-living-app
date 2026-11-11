import React from 'react';
import { type ScheduleItem, type UserLocation } from '../types';
import { getGoogleMapsFullChainedWalkingUrl } from './Map';
import { getAmbienceTag } from './ItineraryPage';

interface ChainedTimelineProps {
  schedule: ScheduleItem[];
  userLocation?: UserLocation | null;
  planTitle: string;
  energyRequired?: string;
  isPetFilterActive?: boolean;
}

const getStopThumbnail = (item: ScheduleItem, index: number): string => {
  const images = [
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=800&auto=format&fit=crop', // Café / Bistro
    'https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=800&auto=format&fit=crop', // Galería / Cultura
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop', // Restaurante / Cena
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=800&auto=format&fit=crop', // Parque / Jardín
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=800&auto=format&fit=crop', // Terraza / Noche
  ];
  return images[index % images.length];
};

export const ChainedTimeline: React.FC<ChainedTimelineProps> = ({
  schedule,
  userLocation,
  planTitle,
  energyRequired,
  isPetFilterActive = false,
}) => {
  const isChained = schedule.length >= 2;
  const fullWalkingRouteUrl = getGoogleMapsFullChainedWalkingUrl(schedule, userLocation);

  return (
    <div className="space-y-5 text-left animate-fade-in">
      {/* Cabecera de la Línea de Tiempo */}
      <div className="flex items-center justify-between flex-wrap gap-2 pb-1 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF5E2B] shadow-[0_0_12px_#FF5E2B] animate-pulse" />
          <h4 className="text-xs uppercase tracking-widest font-black text-white">
            {isChained
              ? `Itinerario Encadenado (${schedule.length} Paradas Conectadas a Pie)`
              : `Experiencia Focalizada (Plan Único)`}
          </h4>
        </div>
        <span className="text-[10px] text-gray-400 font-mono bg-white/[0.04] px-2.5 py-0.5 rounded-full border border-white/5">
          {isChained ? '≤ 15 min caminando entre paradas' : '1 parada principal'}
        </span>
      </div>

      {/* Vertical Timeline Container */}
      <div className="relative pl-6 sm:pl-8 space-y-6">
        {/* Línea vertical continua de conexión en Naranja Coral */}
        <div className="absolute left-[13px] sm:left-[17px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-[#FF5E2B] via-[#FF5E2B]/80 to-[#FF8C66] shadow-[0_0_8px_rgba(255,94,43,0.4)]" />

        {schedule.map((item, index) => {
          const stopNumber = item.order || index + 1;
          const thumbnail = getStopThumbnail(item, index);
          const stopAmbience = getAmbienceTag(item, energyRequired);

          // URL individual para "Cómo llegar" directo a esta parada
          const singleNavUrl = item.location
            ? `https://www.google.com/maps/dir/?api=1&destination=${item.location.lat},${item.location.lng}&travelmode=walking`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.placeName} ${item.placeAddress || ''}`)}`;

          // Indicador de tiempo a pie desde la parada anterior
          const walkFromPrev = item.walkingTimeFromPrevious || (index === 0 ? 'Punto de inicio' : `${7 + index * 2} min caminando`);

          return (
            <div key={(item.placeId || 'stop') + index} className="relative space-y-3">
              {/* Nodo Circular Numerado en Línea de Tiempo con Acento Coral */}
              <div className="absolute -left-[27px] sm:-left-[31px] top-3.5 w-7 h-7 rounded-full bg-[#0F1015] border-2 border-[#FF5E2B] text-[#FF5E2B] font-black text-xs flex items-center justify-center shadow-[0_0_12px_rgba(255,94,43,0.5)] z-10 select-none">
                {stopNumber}
              </div>

              {/* Conector peatonal visible entre paradas (si no es la primera) */}
              {index > 0 && (
                <div className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-[#FF5E2B]/10 border border-[#FF5E2B]/30 text-[10px] font-bold text-[#FF5E2B] -mt-2 mb-1 shadow-xs">
                  <span>🚶</span>
                  <span>{walkFromPrev}</span>
                  <span className="text-gray-400 font-normal">• Mismo barrio</span>
                </div>
              )}

              {/* Tarjeta de la Parada */}
              <article className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#FF5E2B]/40 transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center gap-4 group backdrop-blur-md">
                {/* Fotografía de la parada */}
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden flex-shrink-0 border border-white/10 relative">
                  <img
                    src={thumbnail}
                    alt={item.placeName}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    loading="lazy"
                  />
                  <span className="absolute bottom-0 right-0 bg-[#FF5E2B] text-white text-[9px] font-black px-1.5 py-0.5 rounded-tl-md">
                    Parada {stopNumber}
                  </span>
                </div>

                {/* Información de la Parada */}
                <div className="flex-grow min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Franja horaria sugerida */}
                    <span className="text-[10px] font-bold text-[#FF5E2B] bg-[#FF5E2B]/15 px-2.5 py-0.5 rounded-md border border-[#FF5E2B]/20">
                      ⏱️ {item.time}
                    </span>

                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">
                      Parada 0{stopNumber}
                    </span>

                    {/* Badge de Ambiente */}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 ${stopAmbience.badgeClass}`}>
                      <span>{stopAmbience.emoji}</span>
                      <span>{stopAmbience.label}</span>
                    </span>

                    {/* Badge Pet-Friendly */}
                    {(item.allowsDogs || isPetFilterActive) && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                        <span>🐾</span>
                        <span>Pet-Friendly</span>
                      </span>
                    )}

                    {/* Badge de Accesibilidad */}
                    {item.accessibilityOptions?.isConfirmedAccessible && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-300 flex items-center gap-1">
                        <span>♿</span>
                        <span>Accesible</span>
                      </span>
                    )}
                  </div>

                  {/* Nombre y Actividad */}
                  <h5 className="text-sm sm:text-base font-bold text-white tracking-tight truncate mt-0.5">
                    {item.placeName}
                  </h5>

                  <p className="text-xs text-gray-300 font-medium">
                    {item.activity}
                  </p>

                  <p className="text-[11px] text-gray-400 truncate">
                    📍 {item.placeAddress || 'Ubicación local en el barrio'}
                  </p>

                  {/* Valoración y notas */}
                  {item.rating && (
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-[10px] text-gray-400">
                        ⭐ {item.rating.toFixed(1)} / 5
                      </span>
                    </div>
                  )}

                  {item.description && (
                    <p className="text-xs text-gray-300 italic bg-white/[0.02] p-2.5 rounded-xl border border-white/5 mt-1">
                      "{item.description}"
                    </p>
                  )}

                  {/* Botones de acción directos por parada */}
                  <div className="pt-2.5 mt-1 border-t border-white/5 flex items-center justify-between gap-2 flex-wrap">
                    <a
                      href={singleNavUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1.5 px-3 rounded-xl bg-[#FF5E2B]/15 hover:bg-[#FF5E2B] text-[#FF5E2B] hover:text-white transition text-xs font-bold flex items-center gap-1.5 cursor-pointer min-h-[38px] active:scale-95 shadow-xs"
                      title="Cómo llegar a esta parada en Google Maps"
                    >
                      <span className="text-xs">🧭</span>
                      <span>Cómo llegar a Parada {stopNumber}</span>
                    </a>

                    <div className="flex items-center gap-1">
                      {item.phoneNumber && (
                        <a
                          href={`tel:${item.phoneNumber}`}
                          className="py-1.5 px-2.5 rounded-xl bg-white/5 hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-300 transition text-xs font-medium flex items-center gap-1 border border-white/5 min-h-[38px]"
                          title="Llamar al local"
                        >
                          <span>📞</span>
                          <span className="hidden sm:inline">Llamar</span>
                        </a>
                      )}

                      {item.websiteUri && (
                        <a
                          href={item.websiteUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-1.5 px-2.5 rounded-xl bg-white/5 hover:bg-sky-500/20 text-gray-300 hover:text-sky-300 transition text-xs font-medium flex items-center gap-1 border border-white/5 min-h-[38px]"
                          title="Visitar sitio web oficial"
                        >
                          <span>🌐</span>
                          <span className="hidden sm:inline">Web</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            </div>
          );
        })}
      </div>

      {/* Botón Principal Requerido: "Abrir Ruta Completa en Google Maps" */}
      <div className="pt-3 space-y-2">
        <a
          href={fullWalkingRouteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-4 px-6 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wider bg-gradient-to-r from-[#FF5E2B] via-[#FF6F3D] to-[#FF5E2B] hover:from-[#E84D1C] hover:to-[#FF5E2B] text-white shadow-[0_6px_28px_rgba(255,94,43,0.4)] transition transform hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-2.5 cursor-pointer text-center select-none"
          title="Abrir ruta completa encadenada con waypoints en Google Maps (a pie)"
        >
          <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <span>Abrir Ruta Completa en Google Maps</span>
        </a>

        <p className="text-[11px] text-gray-400 text-center leading-relaxed">
          Genera la ruta oficial peatonal con origen en {userLocation ? 'tu ubicación actual' : 'la Parada 1'}, parada intermedia en Parada 2 y destino en Parada 3 en una única sesión guiada.
        </p>
      </div>
    </div>
  );
};

export default ChainedTimeline;
