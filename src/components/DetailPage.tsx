import React, { useState } from 'react';
import { type ProposalPlan, type WeatherInfo, type ScheduleItem } from '../types';
import MapComponent, { getGoogleMapsDrivingRouteUrl, getGoogleMapsWalkingRouteUrl } from './Map';
import { useAppContext } from '../context/AppContext';
import SavedPlansModal from './SavedPlansModal';
import SharePlanModal from './SharePlanModal';
import AudioNarrator from './AudioNarrator';
import { getAmbienceTag } from './ItineraryPage';

interface DetailPageProps {
  plan: ProposalPlan;
  weather: WeatherInfo | null;
  onBack: () => void;
  currentIndex?: number;
  totalPlans?: number;
  onSelectPlanIndex?: (index: number) => void;
  embeddedInSplitScreen?: boolean;
}

const TRAVEL_ICONS: Record<string, string> = {
  WALKING: '🚶 A pie',
  TRANSIT: '🚌 Transporte público',
  DRIVING: '🚗 En coche',
  BICYCLING: '🚲 En bicicleta',
};

const DEFAULT_COVER_IMAGES: Record<string, string> = {
  essential: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1600&auto=format&fit=crop',
  alternative: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1600&auto=format&fit=crop',
  surprise: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=1600&auto=format&fit=crop',
};

const getStopThumbnail = (item: ScheduleItem, index: number): string => {
  const images = [
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=800&auto=format&fit=crop', // Café / Bistro
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=800&auto=format&fit=crop', // Restaurante
    'https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=800&auto=format&fit=crop', // Cultura / Galería
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=800&auto=format&fit=crop', // Parque / Jardín
    'https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=800&auto=format&fit=crop', // Bar de autor
  ];
  return images[index % images.length];
};

const DetailPage: React.FC<DetailPageProps> = ({
  plan,
  weather,
  onBack,
  currentIndex = 0,
  totalPlans = 3,
  onSelectPlanIndex,
  embeddedInSplitScreen = false,
}) => {
  const {
    savePlan,
    removeSavedPlan,
    isPlanSaved,
    savedPlans,
    searchCriteria,
    isSavedPlansModalOpen,
    setIsSavedPlansModalOpen,
  } = useAppContext();
  const [activeTab, setActiveTab] = useState<'map' | 'timeline'>('map');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const isSaved = isPlanSaved(plan.id);
  const isPetFilterActive = searchCriteria?.company === 'Con mascota';

  const toggleFavorite = () => {
    if (isSaved) {
      removeSavedPlan(plan.id);
    } else {
      savePlan(plan);
    }
  };

  const heroImage =
    plan.coverImage ||
    DEFAULT_COVER_IMAGES[plan.id] ||
    DEFAULT_COVER_IMAGES.essential;

  const drivingRouteUrl = getGoogleMapsDrivingRouteUrl(plan.schedule);
  const walkingRouteUrl = getGoogleMapsWalkingRouteUrl(plan.schedule);

  // Overall Plan Ambience
  const planAmbience = plan.schedule.some(
    (item) => getAmbienceTag(item, plan.energyRequired).label === 'Concurrido / Con ambiente'
  )
    ? { label: 'Concurrido / Con ambiente', emoji: '✨', badgeClass: 'bg-amber-500/15 border-amber-500/30 text-amber-300' }
    : { label: 'Calmo / Relajado', emoji: '🌿', badgeClass: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' };

  return (
    <div className="flex flex-col h-full bg-[#0F1015] text-white animate-fade-in overflow-y-auto scrollbar-hide select-none text-left">
      {/* Top Floating Navigation Header */}
      <div className="sticky top-0 z-30 px-4 sm:px-5 py-2.5 bg-[#0F1015]/95 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="group flex items-center gap-1.5 sm:gap-2 py-1.5 px-3 rounded-xl bg-white/[0.05] hover:bg-[#FF5E2B]/15 text-gray-300 hover:text-white transition duration-200 text-xs font-bold border border-white/10 hover:border-[#FF5E2B]/30 cursor-pointer"
        >
          <svg
            className="w-4 h-4 text-[#FF5E2B] group-hover:-translate-x-0.5 transition transform"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline">Volver a mis 3 planes</span>
          <span className="sm:hidden">3 Planes</span>
        </button>

        {/* Plan indicator and switchers */}
        <div className="flex items-center gap-2">
          {!embeddedInSplitScreen && (
            <button
              type="button"
              onClick={() => setIsSavedPlansModalOpen(true)}
              className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-xl bg-white/[0.05] hover:bg-[#FF5E2B]/15 border border-white/10 hover:border-[#FF5E2B]/40 text-xs font-bold text-gray-300 hover:text-white transition cursor-pointer"
              title="Ver mis planes guardados"
            >
              <span className="text-red-400">❤️</span>
              <span className="hidden md:inline">Mis Planes</span>
              {savedPlans.length > 0 && (
                <span className="bg-[#FF5E2B] text-white text-[10px] font-black px-1.5 py-0.2 rounded-full min-w-[18px] text-center">
                  {savedPlans.length}
                </span>
              )}
            </button>
          )}

          {onSelectPlanIndex && (
            <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/10 text-xs">
              {[0, 1, 2].map((idx) => (
                <button
                  key={`plan-dot-${idx}`}
                  type="button"
                  onClick={() => onSelectPlanIndex(idx)}
                  className={`py-1 px-2 sm:px-2.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                    currentIndex === idx
                      ? 'bg-[#FF5E2B] text-white shadow-sm'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Plan 0{idx + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hero Header with High-Resolution Photography */}
      <section className="relative w-full h-72 md:h-80 flex-shrink-0 overflow-hidden bg-black">
        <img
          src={heroImage}
          alt={plan.title}
          className="w-full h-full object-cover opacity-75 transform scale-100 hover:scale-105 transition duration-700"
        />

        {/* Editorial Gradients to Negro Ónix */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0F1015] via-[#0F1015]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0F1015]/80 via-transparent to-transparent" />

        {/* Hero Title & Identity Content */}
        <div className="absolute bottom-5 left-5 right-5 space-y-3 z-10">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-widest font-black text-[#FF5E2B] bg-[#FF5E2B]/15 border border-[#FF5E2B]/30 px-3 py-1 rounded-full shadow-sm backdrop-blur-md">
                {plan.badge}
              </span>

              {/* Plan B Pill */}
              {(plan.isPlanB || weather?.isRainy) && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 backdrop-blur-md flex items-center gap-1">
                  <span>🛡️</span>
                  <span>Plan B: A Cubierto</span>
                </span>
              )}

              {/* Ambience Pill */}
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border backdrop-blur-md flex items-center gap-1 ${planAmbience.badgeClass}`}>
                <span>{planAmbience.emoji}</span>
                <span>{planAmbience.label}</span>
              </span>

              {/* Pet-friendly Pill */}
              {isPetFilterActive && (
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 backdrop-blur-md flex items-center gap-1">
                  <span>🐾</span>
                  <span>Pet-Friendly</span>
                </span>
              )}

              <span className="text-xs text-gray-300 font-medium bg-black/40 px-2.5 py-0.5 rounded-md backdrop-blur-xs">
                {plan.tagline}
              </span>
            </div>

            {/* Favorite & Share buttons in Hero */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleFavorite}
                className={`py-1.5 px-3 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 backdrop-blur-md cursor-pointer ${
                  isSaved
                    ? 'bg-[#FF5E2B]/30 border-[#FF5E2B] text-white'
                    : 'bg-black/50 border-white/20 text-gray-200 hover:text-white hover:border-[#FF5E2B]/50'
                }`}
                title={isSaved ? 'Quitar de guardados' : 'Guardar en Mis Planes'}
              >
                <span>{isSaved ? '❤️' : '🤍'}</span>
                <span>{isSaved ? 'Guardado' : 'Guardar'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsShareModalOpen(true)}
                className="py-1.5 px-3 rounded-xl bg-black/50 hover:bg-[#FF5E2B]/20 border border-white/20 hover:border-[#FF5E2B]/50 text-white text-xs font-bold transition flex items-center gap-1.5 backdrop-blur-md cursor-pointer"
                title="Compartir tarjeta postal"
              >
                <svg className="w-3.5 h-3.5 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span>Compartir</span>
              </button>
            </div>
          </div>

          <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight leading-tight drop-shadow-md">
            {plan.title}
          </h1>

          <p className="text-xs md:text-sm text-gray-300 max-w-2xl leading-relaxed drop-shadow-sm">
            {plan.shortDescription}
          </p>
        </div>
      </section>

      {/* Main Content Body */}
      <div className="px-5 py-6 space-y-7 max-w-4xl mx-auto w-full">
        {/* TASTELOCAL PLAN B: Alerta en Ficha */}
        {(plan.isPlanB || weather?.isRainy) && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/60 via-[#0F1015] to-transparent border border-blue-500/40 text-xs text-gray-200 animate-fade-in flex items-start gap-3.5 shadow-lg">
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
                Debido a las condiciones de lluvia o mal tiempo detectadas en la zona ({weather?.temp ?? 'N/D'}°C, {weather?.condition || 'Lluvia'}), este plan se compone exclusivamente de locales resguardados, acogedores y con encanto.
              </p>
            </div>
          </div>
        )}

        {/* Practical Data Pills Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Duration */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#FF5E2B]/30 transition">
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 block mb-1">
              ⏱️ Duración aproximada
            </span>
            <span className="text-sm font-extrabold text-white block">
              {plan.approxDuration}
            </span>
          </div>

          {/* Budget */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#FF5E2B]/30 transition">
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 block mb-1">
              💶 Presupuesto orientativo
            </span>
            <span className="text-sm font-extrabold text-white block">
              {plan.budgetEstimate || '20€ - 35€ / pers.'}
            </span>
          </div>

          {/* Energy */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#FF5E2B]/30 transition">
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 block mb-1">
              ⚡ Nivel de energía
            </span>
            <span className="text-sm font-extrabold text-[#FF5E2B] block">
              {plan.energyRequired || 'Ritmo equilibrado'}
            </span>
          </div>

          {/* Weather */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#FF5E2B]/30 transition">
            <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 block mb-1">
              ⛅ Meteorología
            </span>
            <span className="text-sm font-extrabold text-white block truncate">
              {weather && weather.isAvailable && weather.temp !== null
                ? `${weather.temp}°C • ${weather.condition}`
                : 'Planes versátiles'}
            </span>
          </div>

          {/* Accessibility Info Pill: solo cuando existan datos confirmados en Places API */}
          {plan.schedule.some((s) => s.accessibilityOptions?.isConfirmedAccessible) ? (
            <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-500/50 transition col-span-2 md:col-span-4 flex items-center justify-between text-xs text-emerald-200">
              <div className="flex items-center gap-2">
                <span className="text-base text-emerald-400">♿</span>
                <span className="font-medium">
                  Accesibilidad confirmada en Places API ({plan.schedule.filter((s) => s.accessibilityOptions?.isConfirmedAccessible).length} de {plan.schedule.length} paradas con acceso verificado para movilidad reducida o baja exigencia física).
                </span>
              </div>
              <span className="text-[10px] text-emerald-300 font-bold bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-md flex-shrink-0">
                Confirmado en Places API
              </span>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 col-span-2 md:col-span-4 flex items-center justify-between text-xs text-gray-400">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">♿</span>
                <span className="font-normal text-[11px] text-gray-400">
                  {plan.accessibilityInfo || 'Tránsito peatonal estándar (sin datos específicos de movilidad reducida confirmados por los locales en Places API).'}
                </span>
              </div>
              <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-md flex-shrink-0">
                Sin datos confirmados
              </span>
            </div>
          )}
        </section>

        {/* Editorial Narrative: "Qué vas a vivir y por qué merece la pena" */}
        <section className="p-6 rounded-3xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/10 shadow-2xl space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#FF5E2B]/15 border border-[#FF5E2B]/30 text-[#FF5E2B] flex items-center justify-center font-bold text-base shadow-sm">
              ✨
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest font-bold text-[#FF5E2B] block">
                Atmósfera & Propósito (Módulo Experience)
              </span>
              <h2 className="text-lg md:text-xl font-black text-white tracking-tight">
                Qué vas a vivir y por qué merece la pena
              </h2>
            </div>
          </div>

          <p className="text-xs md:text-sm text-gray-200 leading-relaxed font-normal">
            {plan.experienceNarrative ||
              `Una experiencia diseñada con mimo para fluir sin prisas. La atmósfera de cada local ha sido seleccionada de forma rigurosa para acompañar tu estado de ánimo, ofreciéndote momentos de desconexión, sabor genuino y descubrimientos auténticos en cada rincón.`}
          </p>

          {/* Emotional Rationale ("Por qué conecta con cómo te sientes hoy") con Audio-Guía */}
          <div className="p-4 rounded-2xl bg-[#FF5E2B]/[0.08] border border-[#FF5E2B]/20 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs font-black text-[#FF5E2B] uppercase tracking-wider">
                <svg className="w-3.5 h-3.5 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Por qué conecta con cómo te sientes hoy</span>
              </div>

              {/* Audio-guía emocional narrativa */}
              <AudioNarrator
                title={plan.title}
                tagline={plan.tagline}
                matchReason={plan.matchReason}
                experienceNarrative={plan.experienceNarrative}
              />
            </div>
            <p className="text-xs text-gray-200 leading-relaxed italic">
              "{plan.matchReason}"
            </p>
          </div>
        </section>

        {/* View Mode Switcher: Interactive Map vs Chronological List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
                Itinerario Completo
              </span>
              <h3 className="text-lg font-black text-white tracking-tight">
                Paradas de la Experiencia ({plan.schedule.length} lugares verificados)
              </h3>
            </div>

            <div className="flex items-center gap-1 bg-white/[0.05] p-1 rounded-xl border border-white/10 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('map')}
                className={`py-1.5 px-3 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'map'
                    ? 'bg-[#FF5E2B] text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span>Mapa Interactivo</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('timeline')}
                className={`py-1.5 px-3 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'timeline'
                    ? 'bg-[#FF5E2B] text-white shadow-sm'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                <span>Lista Cronológica</span>
              </button>
            </div>
          </div>

          {/* Tab 1: Interactive Dark Map */}
          {activeTab === 'map' && (
            <div className="space-y-4 animate-fade-in">
              <div className="w-full h-96 rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative">
                <MapComponent schedule={plan.schedule} showNavigationButton={false} />
              </div>

              {/* Stop cards overview beneath map with Ambience/Pet Tags & Quick Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {plan.schedule.map((item, idx) => {
                  const stopAmbience = getAmbienceTag(item, plan.energyRequired);
                  const walkingNavUrl = item.location
                    ? `https://www.google.com/maps/dir/?api=1&destination=${item.location.lat},${item.location.lng}&travelmode=walking`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.placeName} ${item.placeAddress || ''}`)}`;

                  return (
                    <div
                      key={(item.placeId || 'scard') + idx}
                      className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#FF5E2B]/40 transition flex flex-col justify-between gap-2.5"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] flex-wrap gap-1">
                          <span className="font-black text-[#FF5E2B] bg-[#FF5E2B]/15 px-2 py-0.5 rounded-md">
                            {item.time}
                          </span>

                          <span className={`font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 ${stopAmbience.badgeClass}`}>
                            <span>{stopAmbience.emoji}</span>
                            <span>{stopAmbience.label}</span>
                          </span>

                          {(item.allowsDogs || isPetFilterActive) && (
                            <span className="font-semibold px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                              <span>🐾</span>
                            </span>
                          )}

                          {item.accessibilityOptions?.isConfirmedAccessible && (
                            <span className="font-semibold px-1.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-300 flex items-center gap-1 text-[10px]" title="Acceso movilidad reducida verificado en Places API">
                              <span>♿</span>
                            </span>
                          )}

                          <span className="text-gray-400 font-bold">Paso 0{idx + 1}</span>
                        </div>
                        <h4 className="text-xs font-bold text-white truncate">{item.placeName}</h4>
                        <p className="text-[11px] text-gray-300 truncate">{item.activity}</p>
                        <p className="text-[10px] text-gray-500 truncate">{item.placeAddress || 'Dirección no especificada'}</p>
                        {item.location && (
                          <span className="text-[10px] text-gray-400 block mt-1">
                            ⭐ {item.rating ? `${item.rating.toFixed(1)} / 5` : 'Sin valoraciones suficientes'}
                          </span>
                        )}
                      </div>

                      {/* Quick Actions Bar */}
                      <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-1.5 flex-wrap">
                        <a
                          href={walkingNavUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="py-1 px-2.5 rounded-lg bg-[#FF5E2B]/15 hover:bg-[#FF5E2B] text-[#FF5E2B] hover:text-white transition text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                          title="Iniciar ruta a pie en Google Maps"
                        >
                          <span>🧭 Iniciar Ruta</span>
                        </a>

                        <div className="flex items-center gap-1">
                          {item.phoneNumber ? (
                            <a
                              href={`tel:${item.phoneNumber}`}
                              className="py-1 px-2 rounded-lg bg-white/5 hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-300 transition text-[11px] font-semibold flex items-center gap-1 border border-white/5"
                              title={`Llamar a ${item.placeName} (${item.phoneNumber})`}
                            >
                              <span>📞 Llamar</span>
                            </a>
                          ) : (
                            <span
                              className="py-1 px-1.5 rounded-lg text-gray-500 text-[10px] cursor-default"
                              title="Sin teléfono listado en Places"
                            >
                              📞 Sin tlf.
                            </span>
                          )}

                          {item.websiteUri ? (
                            <a
                              href={item.websiteUri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="py-1 px-2 rounded-lg bg-white/5 hover:bg-sky-500/20 text-gray-300 hover:text-sky-300 transition text-[11px] font-semibold flex items-center gap-1 border border-white/5"
                              title="Visitar sitio web oficial"
                            >
                              <span>🌐 Sitio Web</span>
                            </a>
                          ) : (
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(`${item.placeName} ${item.placeAddress || ''}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="py-1 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition text-[10px] font-medium flex items-center gap-1"
                              title="Buscar información oficial en Google"
                            >
                              <span>🌐 Info</span>
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 2: Accessible Chronological List (Paso 1, Paso 2, Paso 3) */}
          {activeTab === 'timeline' && (
            <div className="relative pl-6 space-y-6 pt-2 animate-fade-in">
              {/* Dotted connecting line */}
              <div className="absolute left-[7px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-[#FF5E2B] via-white/20 to-[#FF5E2B]"></div>

              {plan.schedule.map((item, index) => {
                const thumbnail = getStopThumbnail(item, index);
                const stopAmbience = getAmbienceTag(item, plan.energyRequired);
                const walkingNavUrl = item.location
                  ? `https://www.google.com/maps/dir/?api=1&destination=${item.location.lat},${item.location.lng}&travelmode=walking`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.placeName} ${item.placeAddress || ''}`)}`;

                return (
                  <div key={(item.placeId || 'step') + index} className="relative space-y-3">
                    {/* Glowing Coral Pin on Timeline */}
                    <div className="absolute -left-[23px] top-2 w-4 h-4 rounded-full bg-[#FF5E2B] border-2 border-[#0F1015] shadow-[0_0_10px_#FF5E2B]"></div>

                    <article className="p-4 sm:p-5 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-[#FF5E2B]/40 transition flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      {/* Photo Thumbnail */}
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden flex-shrink-0 border border-white/10 relative">
                        <img
                          src={thumbnail}
                          alt={item.placeName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <span className="absolute bottom-0 right-0 bg-[#FF5E2B] text-white text-[9px] font-black px-1.5 py-0.5 rounded-tl-md">
                          #{index + 1}
                        </span>
                      </div>

                      {/* Stop Info */}
                      <div className="flex-grow min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-[#FF5E2B] bg-[#FF5E2B]/15 px-2 py-0.5 rounded-md">
                            {item.time}
                          </span>
                          <span className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">
                            Paso 0{index + 1}
                          </span>

                          {/* Stop Ambience badge */}
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 ${stopAmbience.badgeClass}`}>
                            <span>{stopAmbience.emoji}</span>
                            <span>{stopAmbience.label}</span>
                          </span>

                          {/* Pet Badge */}
                          {(item.allowsDogs || isPetFilterActive) && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                              <span>🐾</span>
                              <span>Pet-Friendly</span>
                            </span>
                          )}

                          {/* Confirmed Accessibility Badge */}
                          {item.accessibilityOptions?.isConfirmedAccessible && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-300 flex items-center gap-1" title="Acceso para movilidad reducida confirmado por Places API">
                              <span>♿</span>
                              <span>Movilidad Reducida</span>
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm sm:text-base font-bold text-white truncate">
                          {item.placeName}
                        </h4>

                        <p className="text-xs text-gray-300 font-medium">{item.activity}</p>
                        <p className="text-[11px] text-gray-400 truncate">{item.placeAddress || 'Dirección no especificada'}</p>

                        {/* Real Rating or "Sin valoraciones suficientes" */}
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-[10px] text-gray-400">
                            ⭐ {item.rating ? `${item.rating.toFixed(1)} / 5` : 'Sin valoraciones suficientes'}
                          </span>
                        </div>

                        {item.description && (
                          <p className="text-xs text-gray-300 italic bg-white/[0.02] p-2.5 rounded-xl border border-white/5 mt-1.5">
                            "{item.description}"
                          </p>
                        )}

                        {/* Transit connection info to next stop */}
                        {item.routeInfo && (
                          <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2 text-[11px] text-gray-400">
                            <span>{TRAVEL_ICONS[item.routeInfo.travelMode] || '🚶 A pie'}</span>
                            <span>•</span>
                            <span>{item.routeInfo.duration}</span>
                            <span>•</span>
                            <span>{item.routeInfo.distance}</span>
                          </div>
                        )}

                        {/* Quick Actions Bar in Timeline */}
                        <div className="mt-3 pt-2 border-t border-white/10 flex items-center gap-2 flex-wrap">
                          <a
                            href={walkingNavUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-1 px-3 rounded-lg bg-[#FF5E2B]/15 hover:bg-[#FF5E2B] text-[#FF5E2B] hover:text-white transition text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <span>🧭 Iniciar Ruta</span>
                          </a>

                          {item.phoneNumber ? (
                            <a
                              href={`tel:${item.phoneNumber}`}
                              className="py-1 px-2.5 rounded-lg bg-white/5 hover:bg-emerald-500/20 text-gray-200 hover:text-emerald-300 transition text-xs font-bold flex items-center gap-1 border border-white/5"
                              title={`Llamar a ${item.placeName}`}
                            >
                              <span>📞 Llamar</span>
                            </a>
                          ) : (
                            <span className="py-1 px-2 rounded-lg text-gray-500 text-[11px] cursor-default" title="Teléfono no listado">
                              📞 Sin tlf.
                            </span>
                          )}

                          {item.websiteUri ? (
                            <a
                              href={item.websiteUri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="py-1 px-2.5 rounded-lg bg-white/5 hover:bg-sky-500/20 text-gray-200 hover:text-sky-300 transition text-xs font-bold flex items-center gap-1 border border-white/5"
                              title="Página web oficial"
                            >
                              <span>🌐 Sitio Web</span>
                            </a>
                          ) : (
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(`${item.placeName} ${item.placeAddress || ''}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="py-1 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition text-[11px] font-medium flex items-center gap-1"
                              title="Buscar información oficial en Google"
                            >
                              <span>🌐 Info</span>
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Direct Single Stop Map Action */}
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.placeName} ${item.placeAddress || ''}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-2 px-3.5 rounded-xl bg-white/5 hover:bg-[#FF5E2B]/20 text-gray-300 hover:text-white transition text-xs font-bold flex items-center gap-1.5 border border-white/10 flex-shrink-0 cursor-pointer self-stretch sm:self-auto justify-center"
                      >
                        <span>Cómo llegar</span>
                        <svg className="w-3.5 h-3.5 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </article>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Prominent Continuous Native Navigation Section (Driving and Walking multi-stop deep links) */}
        <section className="pt-4 pb-8 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href={drivingRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-wider bg-[#FF5E2B] hover:bg-[#E84D1C] text-white shadow-[0_6px_28px_rgba(255,94,43,0.4)] transition transform hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-2.5 cursor-pointer text-center"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>🚗 Iniciar ruta completa en coche</span>
            </a>

            <a
              href={walkingRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-wider bg-white/10 hover:bg-white/20 border border-white/20 text-white shadow-sm transition transform hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-2.5 cursor-pointer text-center"
            >
              <svg className="w-5 h-5 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span>🚶 Iniciar ruta a pie completa</span>
            </a>
          </div>

          <p className="text-[11px] text-gray-500 text-center">
            Abre Google Maps con todas las paradas enlazadas de origen a fin en una única sesión guiada.
          </p>
        </section>
      </div>

      {/* Modals */}
      <SavedPlansModal
        isOpen={isSavedPlansModalOpen}
        onClose={() => setIsSavedPlansModalOpen(false)}
      />

      <SharePlanModal
        plan={plan}
        moodPhrase={plan.tagline}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />
    </div>
  );
};

export default DetailPage;
