import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import LoadingState from './LoadingState';
import MapComponent, { getGoogleMapsDrivingRouteUrl, getGoogleMapsWalkingRouteUrl } from './Map';
import DetailPage from './DetailPage';
import ResultsPage from './ResultsPage';
import SavedPlansModal from './SavedPlansModal';
import SharePlanModal from './SharePlanModal';
import AudioNarrator from './AudioNarrator';
import PWAInstallButton from './PWAInstallButton';
import {
  type ScheduleItem,
  type ProposalPlan,
} from '../types';

type PageMode = 'proposals' | 'detail' | 'map';

// Indicador inteligente de ambiente y concurrencia por contexto horario y tipología
export interface AmbienceInfo {
  label: 'Calmo / Relajado' | 'Concurrido / Con ambiente';
  emoji: string;
  badgeClass: string;
}

export const getAmbienceTag = (item: ScheduleItem, planEnergy?: string): AmbienceInfo => {
  const text = `${item.activity} ${item.placeName}`.toLowerCase();
  const timeHour = item.time ? parseInt(item.time.split(':')[0], 10) : new Date().getHours();

  const isLively =
    /bar|tapas|cervec|mercado|pub|animad|fiesta|bistró|vermut|noche|rooftop|concurrido/i.test(text) ||
    (Boolean(planEnergy) && /vigoroso|8|9|10|alta|fiesta/i.test(planEnergy!)) ||
    (timeHour >= 13 && timeHour <= 15) ||
    (timeHour >= 21);

  if (isLively && !/parque|jardín|lectura|mirador|tranquil|librería/i.test(text)) {
    return {
      label: 'Concurrido / Con ambiente',
      emoji: '✨',
      badgeClass: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
    };
  }

  return {
    label: 'Calmo / Relajado',
    emoji: '🌿',
    badgeClass: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
  };
};

const ItineraryPage: React.FC = () => {
  const {
    itinerary,
    weather,
    isLoading,
    loadingMessage,
    error,
    handleBackToHome,
    savedPlans,
    isSavedPlansModalOpen,
    setIsSavedPlansModalOpen,
    visitedPlaces,
    userTasteProfile,
    setIsPreferencesModalOpen,
    searchCriteria,
  } = useAppContext();
  const [selectedPlanIndex, setSelectedPlanIndex] = useState<number>(0);
  const [pageMode, setPageMode] = useState<PageMode>('proposals');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  if (isLoading) {
    return <LoadingState currentStep={loadingMessage || 'Interpretando tu estado de ánimo...'} />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-[#0F1015] text-white animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-400 flex items-center justify-center text-3xl mb-4 shadow-lg">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="font-extrabold text-lg text-white">Sin resultados suficientes</h3>
        <p className="text-gray-400 mt-2 text-xs md:text-sm max-w-sm leading-relaxed">{error}</p>
        <button
          onClick={handleBackToHome}
          className="mt-6 py-3 px-6 bg-[#FF5E2B] hover:bg-[#E84D1C] text-white text-xs font-bold rounded-xl shadow-lg transition transform hover:scale-105 active:scale-95 cursor-pointer"
        >
          Modificar preferencias
        </button>
      </div>
    );
  }

  if (!itinerary) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-[#0F1015] text-white">
        <h3 className="font-bold text-base text-gray-300">Sin itinerario disponible</h3>
        <p className="mt-2 text-xs text-gray-500 max-w-sm">No hemos podido construir los planes con las opciones seleccionadas.</p>
        <button
          onClick={handleBackToHome}
          className="mt-6 py-2.5 px-6 bg-[#FF5E2B] text-white text-xs font-bold rounded-xl shadow transition"
        >
          Empezar de nuevo
        </button>
      </div>
    );
  }

  // Normalizar las 3 propuestas asegurando que siempre existan las 3 variantes requeridas
  const proposals: ProposalPlan[] = (itinerary.proposals && itinerary.proposals.length >= 3)
    ? itinerary.proposals
    : [
        {
          id: 'ideal',
          badge: 'PLAN IDEAL',
          tagline: 'Encaje directo con tu momento',
          title: itinerary.mainPlan.title || 'Propuesta Ideal',
          shortDescription: itinerary.mainPlan.shortDescription || 'Ruta directa ajustada a tu emoción.',
          matchReason: 'Conecta con tu momento ofreciendo un ritmo armónico y desconexión auténtica.',
          approxDuration: '2 a 4 horas',
          experienceNarrative: 'Una experiencia seleccionada con esmero para disfrutar del ritmo auténtico de la zona sin prisas.',
          accessibilityInfo: 'Paseo accesible con tránsito llano.',
          budgetEstimate: '20€ - 35€ / pers.',
          energyRequired: 'Ritmo pausado',
          schedule: itinerary.mainPlan.schedule,
        },
        {
          id: 'alternative',
          badge: 'PLAN ALTERNATIVO',
          tagline: 'Misma emoción, enfoque distinto',
          title: itinerary.premiumContingencyPlan?.title || 'Alternativa Cultural & Gastro',
          shortDescription: itinerary.premiumContingencyPlan?.shortDescription || 'Un enfoque complementario en la misma zona.',
          matchReason: itinerary.premiumContingencyPlan?.reasonForChange || 'Una alternativa para explorar el lado más sensorial de la zona a tu propio compás.',
          approxDuration: '2 a 4 horas',
          experienceNarrative: 'Una propuesta para quienes disfrutan descubriendo la zona desde un ángulo más pausado y con encanto local.',
          accessibilityInfo: 'Recorrido urbano accesible.',
          budgetEstimate: '15€ - 30€ / pers.',
          energyRequired: 'Equilibrado',
          schedule: itinerary.premiumContingencyPlan?.schedule || itinerary.mainPlan.schedule.slice().reverse(),
        },
        {
          id: 'surprise',
          badge: 'PLAN SORPRESA',
          tagline: 'Propuesta singular e inesperada',
          title: 'Descubrimiento Singular & Secreto',
          shortDescription: 'Lugares con carácter propio para romper la rutina.',
          matchReason: 'Para cuando te apetece dejarte llevar y conocer un rincón genuino con alma local.',
          approxDuration: '2 a 3 horas',
          experienceNarrative: 'Espacios inesperados con personalidad propia para quienes buscan una vivencia fuera de lo común.',
          accessibilityInfo: 'Acceso peatonal accesible.',
          budgetEstimate: '15€ - 25€ / pers.',
          energyRequired: 'Curioso e intuitivo',
          schedule: itinerary.mainPlan.schedule.slice(0, 2),
        },
      ];

  const activePlan = proposals[selectedPlanIndex] || proposals[0];

  // Continuous multi-stop route links
  const drivingRouteUrl = getGoogleMapsDrivingRouteUrl(activePlan.schedule);
  const walkingRouteUrl = getGoogleMapsWalkingRouteUrl(activePlan.schedule);

  return (
    <div className="flex flex-col h-full bg-[#0F1015] text-white animate-fade-in overflow-hidden select-none">
      {/* Top Header */}
      <header className="px-4 sm:px-5 py-3 sm:py-3.5 bg-[#0F1015]/95 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between sticky top-0 z-20 safe-pt">
        <div className="flex items-center gap-2">
          <button
            onClick={pageMode === 'detail' ? () => setPageMode('proposals') : handleBackToHome}
            className="text-gray-400 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <svg className="w-4 h-4 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
            {pageMode === 'detail' ? (
              <>
                <span className="hidden sm:inline">Volver a las 3 propuestas</span>
                <span className="sm:hidden">3 Propuestas</span>
              </>
            ) : (
              <>
                <span className="hidden sm:inline">Ajustar búsqueda</span>
                <span className="sm:hidden">Atrás</span>
              </>
            )}
          </button>

          {(searchCriteria?.cityName || searchCriteria?.location?.cityName) && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FF5E2B]/10 border border-[#FF5E2B]/20 text-[11px] text-gray-200">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF5E2B]"></span>
              <span className="font-semibold text-white">
                {searchCriteria.cityName || searchCriteria.location?.cityName}
              </span>
              <span className="text-[10px] text-[#FF5E2B] font-mono">
                {searchCriteria.environment === 'Escapada' ? 'Alrededores' : '≤ 5 km'}
              </span>
            </div>
          )}
        </div>

        {/* Header Right Actions: PWAInstall, AudioNarrator, Saved Plans Modal Button & View Mode Toggle */}
        <div className="flex items-center gap-2">
          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* 🎧 Escuchar mi plan Audio-Guía */}
          <AudioNarrator
            title={activePlan.title}
            tagline={activePlan.tagline}
            matchReason={activePlan.matchReason}
            experienceNarrative={activePlan.experienceNarrative}
          />

          {/* 🎛️ Mis Preferencias Button */}
          <button
            type="button"
            onClick={() => setIsPreferencesModalOpen(true)}
            className="flex items-center gap-1.5 py-1.5 px-2.5 sm:px-3 rounded-xl bg-white/[0.05] hover:bg-[#FF5E2B]/15 border border-white/10 hover:border-[#FF5E2B]/40 text-xs font-bold text-gray-300 hover:text-white transition cursor-pointer"
            title="Mi Perfil de Gustos y Sitios Visitados"
          >
            <span>🎛️</span>
            <span className="hidden xl:inline">Mis Preferencias</span>
            {userTasteProfile.manualRestrictions.length + visitedPlaces.length > 0 && (
              <span className="bg-white/15 text-white text-[10px] font-black px-1.5 py-0.2 rounded-full min-w-[18px] text-center">
                {userTasteProfile.manualRestrictions.length + visitedPlaces.length}
              </span>
            )}
          </button>

          {/* ❤️ Mis Planes Button */}
          <button
            type="button"
            onClick={() => setIsSavedPlansModalOpen(true)}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-white/[0.05] hover:bg-[#FF5E2B]/15 border border-white/10 hover:border-[#FF5E2B]/40 text-xs font-bold text-gray-300 hover:text-white transition cursor-pointer"
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

          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-white/[0.05] p-1 rounded-xl border border-white/10 text-xs font-bold">
            <button
              type="button"
              onClick={() => setPageMode('proposals')}
              className={`py-1 px-2.5 sm:px-3 rounded-lg transition cursor-pointer ${
                pageMode === 'proposals'
                  ? 'bg-[#FF5E2B] text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              3 Propuestas
            </button>
            <button
              type="button"
              onClick={() => setPageMode('detail')}
              className={`py-1 px-2.5 sm:px-3 rounded-lg transition cursor-pointer ${
                pageMode === 'detail'
                  ? 'bg-[#FF5E2B] text-white shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              Ficha
            </button>
            {/* Map toggle on mobile screens (< lg) */}
            <button
              type="button"
              onClick={() => setPageMode('map')}
              className={`lg:hidden py-1 px-2 sm:px-2.5 rounded-lg transition cursor-pointer ${
                pageMode === 'map'
                  ? 'bg-[#FF5E2B] text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Ver mapa en móvil"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body: Desktop Editorial Split Screen (Left: Ficha/Proposals, Right: Live Map) / Mobile Responsive */}
      <main className="flex-grow overflow-hidden flex flex-col lg:flex-row">
        {/* Full-screen Mobile Map View when triggered explicitly on small viewports */}
        {pageMode === 'map' ? (
          <div className="w-full h-full relative lg:hidden">
            <MapComponent schedule={activePlan.schedule} />
            <button
              onClick={() => setPageMode('proposals')}
              className="absolute top-4 left-4 z-10 py-2 px-3.5 bg-[#0F1015]/90 border border-white/20 text-white rounded-xl text-xs font-bold shadow-lg backdrop-blur-md flex items-center gap-1.5 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              <span>Volver a las 3 propuestas</span>
            </button>

            {/* Quick multi-stop route buttons on mobile map */}
            <div className="absolute bottom-5 left-4 right-4 z-10 flex gap-2 safe-mb">
              <a
                href={drivingRouteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-3 px-3 rounded-xl bg-[#FF5E2B] text-white font-black text-xs text-center shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>🚗 Ruta en coche</span>
              </a>
              <a
                href={walkingRouteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-3 px-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-black text-xs text-center shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>🚶 Ruta a pie</span>
              </a>
            </div>
          </div>
        ) : null}

        {/* Editorial Content Column (Left Side on Desktop Split Screen, Full Width on Mobile) */}
        <div
          className={`${
            pageMode === 'map' ? 'hidden lg:block' : 'block'
          } w-full lg:w-[54%] xl:w-[50%] h-full overflow-hidden text-left`}
        >
          {pageMode === 'detail' ? (
            <DetailPage
              plan={activePlan}
              weather={weather}
              onBack={() => setPageMode('proposals')}
              currentIndex={selectedPlanIndex}
              totalPlans={proposals.length}
              onSelectPlanIndex={(idx) => setSelectedPlanIndex(idx)}
              embeddedInSplitScreen={true}
            />
          ) : (
            <div className="h-full overflow-y-auto px-4 sm:px-6 md:px-8 py-5 space-y-6 scrollbar-hide">
              {/* MÓDULO DISCOVER: ResultsPage component */}
              <ResultsPage
                proposals={proposals}
                selectedPlanIndex={selectedPlanIndex}
                onSelectPlanIndex={(idx) => setSelectedPlanIndex(idx)}
                onViewExperienceDetail={() => setPageMode('detail')}
                onOpenShareModal={() => setIsShareModalOpen(true)}
                weather={weather}
              />
            </div>
          )}
        </div>

        {/* Desktop Sticky Live Map Pane (Split Screen Layout - MÓDULO EXPERIENCE) */}
        <div className="hidden lg:flex lg:flex-col lg:w-[46%] xl:w-[50%] h-full relative border-l border-white/[0.08] bg-[#0F1015]">
          {/* Live Map Header */}
          <div className="px-5 py-3 bg-[#0F1015]/90 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF5E2B] animate-pulse" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Ruta interactiva en vivo (Módulo Experience)
              </span>
            </div>
            <div className="text-[11px] text-gray-400 font-medium">
              {activePlan.schedule.length} paradas reales • {activePlan.approxDuration}
            </div>
          </div>

          {/* Interactive Map Component */}
          <div className="flex-grow w-full relative">
            <MapComponent schedule={activePlan.schedule} showNavigationButton={false} />

            {/* Floating Bottom Quick Continuous Route Action Bar */}
            <div className="absolute bottom-5 left-5 right-5 z-10 p-3.5 rounded-2xl bg-[#0F1015]/90 backdrop-blur-md border border-white/20 shadow-2xl flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] uppercase tracking-wider font-bold text-[#FF5E2B] block">
                  Iniciar Ruta Continua
                </span>
                <span className="text-xs font-bold text-white truncate block">
                  {activePlan.title}
                </span>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={drivingRouteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3.5 rounded-xl bg-[#FF5E2B] hover:bg-[#E84D1C] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                  title="Abrir en Google Maps (Coche)"
                >
                  <span>🚗 Coche</span>
                </a>
                <a
                  href={walkingRouteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition flex items-center gap-1.5 border border-white/20 cursor-pointer"
                  title="Abrir en Google Maps (A pie)"
                >
                  <span>🚶 A pie</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <SavedPlansModal
        isOpen={isSavedPlansModalOpen}
        onClose={() => setIsSavedPlansModalOpen(false)}
      />

      <SharePlanModal
        plan={activePlan}
        moodPhrase={activePlan.tagline}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
      />
    </div>
  );
};

export default ItineraryPage;
