import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { type ProposalPlan, type WeatherInfo, type ScheduleItem } from '../types';
import AudioNarrator from './AudioNarrator';
import { getAmbienceTag } from './ItineraryPage';
import { getGoogleMapsDrivingRouteUrl, getGoogleMapsWalkingRouteUrl } from './Map';
import QuickActionsBar from './QuickActionsBar';
import ChainedTimeline from './ChainedTimeline';

interface ResultsPageProps {
  proposals: ProposalPlan[];
  selectedPlanIndex: number;
  onSelectPlanIndex: (index: number) => void;
  onViewExperienceDetail: () => void;
  onOpenShareModal: () => void;
  weather: WeatherInfo | null;
}

const getPlaceCoverImage = (item: ScheduleItem, index: number): string => {
  const images = [
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=800&auto=format&fit=crop', // Café / Bistro
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop', // Restaurante
    'https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=800&auto=format&fit=crop', // Cultura / Espacio
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=800&auto=format&fit=crop', // Naturaleza / Parque
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=800&auto=format&fit=crop', // Noche / Vermú
  ];
  return images[index % images.length];
};

const WeatherBadge: React.FC<{ weather: WeatherInfo | null }> = ({ weather }) => {
  if (!weather || !weather.isAvailable || weather.alertLevel === 'unavailable') {
    return (
      <div className="py-2 px-3 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <span>⛅</span>
          <span>Información meteorológica no disponible</span>
        </div>
        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-gray-300 font-medium">Planes versátiles</span>
      </div>
    );
  }

  return (
    <div className="py-2.5 px-3.5 rounded-xl bg-[#FF5E2B]/10 border border-[#FF5E2B]/20 flex items-center justify-between text-xs text-white">
      <div className="flex items-center gap-2.5">
        <span className="text-lg">{weather.icon || '☀️'}</span>
        <div>
          <span className="font-bold text-white">{weather.temp !== null ? `${weather.temp}°C` : ''}</span>
          {weather.temp !== null && <span className="mx-1 text-gray-400">•</span>}
          <span className="capitalize text-gray-300">{weather.condition}</span>
        </div>
      </div>
      <p className="text-[11px] text-gray-300 max-w-[50%] text-right truncate">
        {weather.summary}
      </p>
    </div>
  );
};

export const ResultsPage: React.FC<ResultsPageProps> = ({
  proposals,
  selectedPlanIndex,
  onSelectPlanIndex,
  onViewExperienceDetail,
  onOpenShareModal,
  weather,
}) => {
  const {
    savePlan,
    removeSavedPlan,
    isPlanSaved,
    searchCriteria,
    itinerary,
  } = useAppContext();

  const activePlan = proposals[selectedPlanIndex] || proposals[0];
  const isSaved = isPlanSaved(activePlan.id);
  const isPetFilterActive = searchCriteria?.company === 'Con mascota';

  const toggleFavorite = () => {
    if (isSaved) {
      removeSavedPlan(activePlan.id);
    } else {
      savePlan(activePlan);
    }
  };

  const planAmbience = activePlan.schedule.some(
    (item) => getAmbienceTag(item, activePlan.energyRequired).label === 'Concurrido / Con ambiente'
  )
    ? {
        label: 'Concurrido / Con ambiente',
        emoji: '✨',
        badgeClass: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
      }
    : {
        label: 'Calmo / Relajado',
        emoji: '🌿',
        badgeClass: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
      };

  const drivingRouteUrl = getGoogleMapsDrivingRouteUrl(activePlan.schedule);
  const walkingRouteUrl = getGoogleMapsWalkingRouteUrl(activePlan.schedule);

  return (
    <div className="space-y-6 text-left">
      {/* Selector de las 3 Propuestas Diferenciadas (MÓDULO DISCOVER) */}
      <section className="space-y-3">
        <div>
          <span className="text-[10px] uppercase tracking-widest font-bold text-[#FF5E2B]">
            Módulo Discover • Curaduría Inteligente
          </span>
          <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
            Tus 3 Propuestas a Medida
          </h2>
          <p className="text-xs text-gray-400 mt-0.5 flex flex-wrap items-center gap-1.5">
            <span>Tres enfoques trazados estrictamente en</span>
            <span className="text-[#FF5E2B] font-semibold">
              {searchCriteria?.cityName || searchCriteria?.location?.cityName || 'tu zona'}
            </span>
            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-gray-300 border border-white/10 font-mono">
              {searchCriteria?.environment === 'Escapada' ? '🚗 Modo Escapada' : '📍 Radio local ≤ 5 km'}
            </span>
          </p>
        </div>

        {/* Pestañas de Selección de Plan */}
        <div className="grid grid-cols-3 gap-2">
          {proposals.map((plan, idx) => {
            const isSelected = selectedPlanIndex === idx;
            const planShortName =
              idx === 0 ? 'Plan Ideal' : idx === 1 ? 'Alternativo' : 'Sorpresa';
            const planTag =
              idx === 0 ? 'Encaje directo' : idx === 1 ? 'Enfoque distinto' : 'Inesperado';
            const planEmoji = idx === 0 ? '💎' : idx === 1 ? '🌿' : '✨';

            return (
              <button
                key={plan.id || `prop-${idx}`}
                type="button"
                onClick={() => onSelectPlanIndex(idx)}
                className={`p-3 rounded-2xl border text-center transition-all duration-300 cursor-pointer flex flex-col items-center justify-center gap-1 ${
                  isSelected
                    ? 'bg-[#FF5E2B]/15 border-[#FF5E2B] text-white shadow-[0_0_20px_rgba(255,94,43,0.25)] scale-[1.02]'
                    : 'bg-white/[0.03] border-white/10 text-gray-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                <span className="text-xl">{planEmoji}</span>
                <span
                  className={`text-xs font-black block truncate tracking-tight ${
                    isSelected ? 'text-[#FF5E2B]' : 'text-gray-200'
                  }`}
                >
                  {planShortName}
                </span>
                <span className="text-[9px] text-gray-400 block truncate leading-tight">
                  {planTag}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Estado Meteorológico */}
      <WeatherBadge weather={weather} />

      {/* TASTELOCAL PLAN B: Banner de Adaptación Automática por Clima Adverso */}
      {(activePlan.isPlanB || weather?.isRainy || itinerary?.isPlanBActive) && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/60 via-[#0F1015] to-transparent border border-blue-500/40 text-xs text-gray-200 animate-fade-in flex items-start gap-3.5 shadow-xl">
          <span className="text-2xl flex-shrink-0 mt-0.5">🌧️</span>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-[#FF5E2B] uppercase tracking-wider text-[11px]">
                TasteLocal Plan B Activo
              </span>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded-full font-bold">
                Espacios 100% a Cubierto
              </span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              {itinerary?.planBReason ||
                `Se detectaron precipitaciones o clima adverso en la zona (${weather?.temp ?? 'N/D'}°C, ${weather?.condition || 'Lluvia'}). Se han adaptado automáticamente las paradas hacia espacios íntimos, protegidos y acogedores (bistrós con encanto, galerías de arte, talleres y cafeterías de autor) conservando tu deseo original de "${searchCriteria?.user_mood || 'desconectar'}".`}
            </p>
          </div>
        </div>
      )}

      {/* Tarjeta de la Propuesta Activa */}
      <article className="p-5 sm:p-6 rounded-3xl bg-white/[0.03] border border-white/10 shadow-2xl space-y-4 animate-fade-in relative overflow-hidden backdrop-blur-md">
        {/* Cabecera de la Tarjeta con Badges y Acciones */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs uppercase tracking-widest font-black text-[#FF5E2B] bg-[#FF5E2B]/15 border border-[#FF5E2B]/30 px-3 py-1 rounded-full">
              {activePlan.badge}
            </span>

            {/* Badge Plan B a Cubierto */}
            {(activePlan.isPlanB || weather?.isRainy || itinerary?.isPlanBActive) && (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 flex items-center gap-1">
                <span>🛡️</span>
                <span>Plan B: A Cubierto</span>
              </span>
            )}

            {/* Badge de Ambiente */}
            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${planAmbience.badgeClass}`}>
              <span>{planAmbience.emoji}</span>
              <span>{planAmbience.label}</span>
            </span>

            {/* Badge Pet-Friendly */}
            {isPetFilterActive && (
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                <span>🐾</span>
                <span>Pet-Friendly</span>
              </span>
            )}

            <span className="text-[11px] text-gray-400 font-medium">
              ⏱️ {activePlan.approxDuration}
            </span>
          </div>

          {/* Botones de Favorito y Compartir */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFavorite}
              className={`py-1.5 px-3 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                isSaved
                  ? 'bg-[#FF5E2B]/20 border-[#FF5E2B] text-[#FF5E2B]'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:border-white/30'
              }`}
              title={isSaved ? 'Quitar de guardados' : 'Guardar en Mis Planes'}
            >
              <span>{isSaved ? '❤️' : '🤍'}</span>
              <span className="hidden sm:inline">{isSaved ? 'Guardado' : 'Guardar'}</span>
            </button>

            <button
              type="button"
              onClick={onOpenShareModal}
              className="py-1.5 px-3 rounded-xl bg-white/5 hover:bg-[#FF5E2B]/15 border border-white/10 hover:border-[#FF5E2B]/40 text-gray-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="Compartir postal"
            >
              <svg className="w-3.5 h-3.5 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>Compartir</span>
            </button>
          </div>
        </div>

        {/* Título y Descripción Resumida */}
        <div>
          <h3 className="text-xl md:text-2xl font-black text-white tracking-tight leading-snug">
            {activePlan.title}
          </h3>
          <p className="text-xs md:text-sm text-gray-300 mt-1 leading-relaxed">
            {activePlan.shortDescription}
          </p>
        </div>

        {/* Barra de Acciones Rápidas Táctil 1-Tap (Cómo llegar, Guardar plan, Compartir) */}
        <QuickActionsBar
          plan={activePlan}
          onOpenShareModal={onOpenShareModal}
          className="pt-1 pb-1"
        />

        {/* Sección Requerida: "Por qué conecta con cómo te sientes hoy" */}
        <div className="p-4 rounded-2xl bg-[#FF5E2B]/[0.08] border border-[#FF5E2B]/25 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs font-black text-[#FF5E2B] uppercase tracking-wider">
              <svg className="w-3.5 h-3.5 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Por qué conecta con cómo te sientes hoy</span>
            </div>

            {/* Audio-guía narrativa */}
            <AudioNarrator
              title={activePlan.title}
              tagline={activePlan.tagline}
              matchReason={activePlan.matchReason}
              experienceNarrative={activePlan.experienceNarrative}
            />
          </div>
          <p className="text-xs text-gray-100 leading-relaxed italic">
            "{activePlan.matchReason}"
          </p>
        </div>

        {/* Accesibilidad: solo cuando existan datos confirmados en Places API */}
        {activePlan.schedule.some((s) => s.accessibilityOptions?.isConfirmedAccessible) ? (
          <div className="py-2.5 px-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-2 text-xs text-emerald-200">
            <div className="flex items-center gap-2">
              <span className="text-base text-emerald-400">♿</span>
              <span className="text-[11px] font-medium">
                Accesibilidad confirmada en Places API ({activePlan.schedule.filter((s) => s.accessibilityOptions?.isConfirmedAccessible).length} de {activePlan.schedule.length} paradas adaptadas).
              </span>
            </div>
            <span className="text-[9px] uppercase font-bold bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full flex-shrink-0">
              Confirmado en Places API
            </span>
          </div>
        ) : (
          <div className="py-2 px-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-2 text-xs text-gray-400">
            <span className="text-sm text-gray-500">♿</span>
            <span className="text-[11px] text-gray-400">
              {activePlan.accessibilityInfo || 'Tránsito peatonal estándar (sin datos específicos de movilidad reducida en Places API).'}
            </span>
          </div>
        )}

        {/* Línea de Tiempo Vertical y Ruta Encadenada Multi-Parada */}
        <ChainedTimeline
          schedule={activePlan.schedule}
          userLocation={searchCriteria?.location}
          planTitle={activePlan.title}
          energyRequired={activePlan.energyRequired}
          isPetFilterActive={isPetFilterActive}
        />

        {/* Acciones Principales: Iniciar Ruta Completa & Ver Ficha Editorial (EXPERIENCE) */}
        <div className="pt-2 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <a
              href={drivingRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider bg-[#FF5E2B] hover:bg-[#E84D1C] text-white shadow-[0_4px_16px_rgba(255,94,43,0.3)] transition transform hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer text-center"
              title="Iniciar ruta multi-parada en coche en Google Maps"
            >
              <span>🚗 Iniciar ruta en Google Maps</span>
            </a>

            <a
              href={walkingRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider bg-white/10 hover:bg-white/20 border border-white/20 text-white shadow-sm transition transform hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer text-center"
              title="Iniciar ruta continua a pie en Google Maps"
            >
              <span>🚶 Ruta a pie continua</span>
            </a>
          </div>

          <button
            type="button"
            onClick={onViewExperienceDetail}
            className="w-full py-3.5 px-6 rounded-2xl font-black text-xs uppercase tracking-wider bg-white hover:bg-gray-100 text-[#0F1015] shadow-lg transition transform hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Ver Ficha Detallada (Módulo Experience)</span>
            <svg className="w-4 h-4 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </article>
    </div>
  );
};

export default ResultsPage;
