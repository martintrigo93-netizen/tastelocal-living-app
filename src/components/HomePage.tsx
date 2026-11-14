import React, { useState, lazy, Suspense } from 'react';
import { type Mood, type SearchCriteria } from '../types';
import {
  COMPANY_OPTIONS,
  MOBILITY_OPTIONS,
  BUDGET_OPTIONS,
  ENTORNO_OPTIONS,
  AVAILABLE_TIME_OPTIONS,
  EXPERIENCE_MODE_OPTIONS,
  type AvailableTimeOption,
} from '../constants';
import { analyzeMoodFromText } from '../services/geminiService';
import { useAppContext } from '../context/AppContext';
import GpsLocationWidget from './GpsLocationWidget';

const SavedPlansModal = lazy(() => import('./SavedPlansModal'));

interface NaturalMoodOption extends Mood {
  phrase: string;
  subtext: string;
}

const NATURAL_MOOD_OPTIONS: NaturalMoodOption[] = [
  {
    label: 'Relajado',
    icon: '🌿',
    phrase: 'Necesito desconectar',
    subtext: 'Pausa suave, reset mental y cero prisas',
  },
  {
    label: 'Tranquilo',
    icon: '☕',
    phrase: 'Quiero tranquilidad',
    subtext: 'Rincón acogedor, lectura y atmósfera serena',
  },
  {
    label: 'Aventurero',
    icon: '🧭',
    phrase: 'Tengo ganas de aventura',
    subtext: 'Explorar lo nuevo, movimiento y sorpresa',
  },
  {
    label: 'Curioso',
    icon: '✨',
    phrase: 'Quiero sorprenderme',
    subtext: 'Rutas singulares y secretos locales auténticos',
  },
  {
    label: 'Gastronómico',
    icon: '🍷',
    phrase: 'Un plan gastronómico',
    subtext: 'Sabores auténticos, producto local y sobremesa',
  },
  {
    label: 'Romántico',
    icon: '🕯️',
    phrase: 'Momento íntimo o especial',
    subtext: 'Atmósfera cuidada, encanto y complicidad',
  },
];

interface SpeechRecognitionEventLike {
  results: Array<Array<{ transcript: string }>>;
}

interface SpeechRecognitionErrorLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  start: () => void;
}

type SpeechConstructor = new () => SpeechRecognitionLike;

const HomePage: React.FC = () => {
  const {
    userLocation,
    handleGenerateItinerary,
    handleSurpriseMe,
    formState,
    setFormState,
    savedPlans,
    userAffinities,
    isSavedPlansModalOpen,
    setIsSavedPlansModalOpen,
    visitedPlaces,
    userTasteProfile,
    setIsPreferencesModalOpen,
    handleStartGroupMode,
  } = useAppContext();

  const {
    mood: selectedMood,
    moodDescription,
    entorno: selectedEntorno,
    company: selectedCompany,
    budget: selectedBudget,
    mobility: selectedMobility,
    intensity,
    availableTime,
    experienceMode,
    onlyOpenNow,
  } = formState;

  const [voiceInputStatus, setVoiceInputStatus] = useState<
    'idle' | 'listening' | 'processing' | 'error'
  >('idle');
  const [voiceConfirmation, setVoiceConfirmation] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [appShareFeedback, setAppShareFeedback] = useState<string>('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);
  const [hasCustomIntensity, setHasCustomIntensity] = useState<boolean>(false);
  const [customRadiusKm, setCustomRadiusKm] = useState<number | null>(null);
  const [customAllowSurroundings, setCustomAllowSurroundings] = useState<boolean | null>(null);

  const getDefaultIntensityForMood = (moodLabel?: string): number => {
    switch (moodLabel) {
      case 'Relajado':
        return 3;
      case 'Tranquilo':
        return 3;
      case 'Romántico':
        return 4;
      case 'Gastronómico':
        return 5;
      case 'Curioso':
        return 6;
      case 'Festivo':
        return 7;
      case 'Aventurero':
        return 8;
      default:
        return 5;
    }
  };

  const getDefaultRadiusForTime = (timeId?: '< 2h' | '2-4h' | 'Día completo'): number => {
    if (timeId === '< 2h') return 3;
    if (timeId === 'Día completo') return 15;
    return 5;
  };

  const getAvailableTimeDisplayLabel = (timeOpt: AvailableTimeOption): string => {
    if (timeOpt.id === '< 2h') return 'Menos de 2 h';
    if (timeOpt.id === '2-4h') return '2-4 h';
    return timeOpt.label;
  };

  const handleRecommendApp = async () => {
    const shareUrl =
      typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
    const shareData = {
      title: 'TasteLocal Living — Planes locales que sienten contigo',
      text: 'Descubre rincones auténticos, rutas a medida y planes en pareja o grupo adaptados a tu energía y ubicación en tiempo real.',
      url: shareUrl,
    };

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setAppShareFeedback('✓ Enlace copiado');
      setTimeout(() => setAppShareFeedback(''), 2500);
    } catch {
      setAppShareFeedback('Enlace listo');
      setTimeout(() => setAppShareFeedback(''), 2000);
    }
  };

  // Asegurar entorno, presupuesto y movilidad predeterminados si no están seleccionados
  React.useEffect(() => {
    const patch: Partial<typeof formState> = {};
    if (!selectedEntorno) patch.entorno = ENTORNO_OPTIONS[0];
    if (!selectedBudget) patch.budget = BUDGET_OPTIONS[1];
    if (!selectedMobility) patch.mobility = MOBILITY_OPTIONS[0];
    if (Object.keys(patch).length > 0) {
      setFormState(patch);
    }
  }, [selectedEntorno, selectedBudget, selectedMobility, setFormState]);

  const handleManualMoodSelection = (opt: NaturalMoodOption) => {
    setFormState({
      mood: { label: opt.label, icon: opt.icon },
      moodDescription: opt.phrase,
      ...(!hasCustomIntensity ? { intensity: getDefaultIntensityForMood(opt.label) } : {}),
    });
  };

  const handleListen = () => {
    const windowWithSpeech = window as unknown as {
      SpeechRecognition?: SpeechConstructor;
      webkitSpeechRecognition?: SpeechConstructor;
    };
    const SpeechRecognitionClass =
      windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;

    if (!SpeechRecognitionClass) {
      setVoiceInputStatus('error');
      alert('Tu navegador no admite reconocimiento por voz directo.');
      return;
    }

    try {
      const recognition = new SpeechRecognitionClass();
      recognition.lang = 'es-ES';
      recognition.interimResults = false;

      recognition.onstart = () => {
        setVoiceInputStatus('listening');
        setVoiceConfirmation('');
      };

      recognition.onresult = async (event: SpeechRecognitionEventLike) => {
        const transcript = event.results[event.results.length - 1][0].transcript;
        setVoiceInputStatus('processing');
        try {
          const detectedMood = await analyzeMoodFromText(transcript);
          setFormState({
            moodDescription: transcript,
            mood: detectedMood,
            ...(!hasCustomIntensity ? { intensity: getDefaultIntensityForMood(detectedMood.label) } : {}),
          });
          setVoiceConfirmation(`Interpretado con IA: ${detectedMood.label}`);
          setTimeout(() => setVoiceConfirmation(''), 4500);
        } catch (err) {
          console.warn('Voice mood analysis fallback:', err);
          setFormState({ moodDescription: transcript });
          setVoiceConfirmation('Anotado en tus notas');
          setTimeout(() => setVoiceConfirmation(''), 3000);
        } finally {
          setVoiceInputStatus('idle');
        }
      };

      recognition.onend = () => {
        setVoiceInputStatus('idle');
      };

      recognition.onerror = (event: SpeechRecognitionErrorLike) => {
        console.warn('Speech recognition warning:', event.error);
        setVoiceInputStatus('error');
        setTimeout(() => setVoiceInputStatus('idle'), 2500);
      };

      recognition.start();
    } catch (err) {
      console.warn('Speech recognition start failed:', err);
      setVoiceInputStatus('error');
      setTimeout(() => setVoiceInputStatus('idle'), 2000);
    }
  };

  // Cálculo de etiqueta e intensidad descriptiva
  const getIntensityInfo = (val: number) => {
    if (val <= 3) {
      return {
        label: 'Pausado / Relajante',
        description: 'Ritmo contemplativo, paradas largas y cero sensación de prisa.',
        glowAlpha: 0.2 + val * 0.05,
      };
    }
    if (val <= 7) {
      return {
        label: 'Equilibrado / Disfrute',
        description: 'Paseo continuo, buen ritmo y momentos serenos de descubrimiento.',
        glowAlpha: 0.35 + val * 0.06,
      };
    }
    return {
      label: 'Máxima Energía / Aventura',
      description: 'Experiencias encadenadas, estímulo continuo y dinamismo pleno.',
      glowAlpha: 0.7 + (val - 7) * 0.1,
    };
  };

  const activeTime = availableTime || '2-4h';
  const activeEntorno = selectedEntorno || ENTORNO_OPTIONS[0];
  const activeCompany = selectedCompany || COMPANY_OPTIONS[0];
  const activeBudget = selectedBudget || BUDGET_OPTIONS[1];
  const activeMobility = selectedMobility || MOBILITY_OPTIONS[0];

  const effectiveIntensity = hasCustomIntensity
    ? intensity
    : selectedMood
    ? getDefaultIntensityForMood(selectedMood.label)
    : intensity;

  const effectiveSearchRadiusKm =
    customRadiusKm !== null
      ? customRadiusKm
      : activeEntorno.label === 'Escapada'
      ? 15
      : getDefaultRadiusForTime(activeTime);

  const effectiveAllowSurroundings =
    customAllowSurroundings !== null
      ? customAllowSurroundings
      : effectiveSearchRadiusKm >= 15 || activeEntorno.label === 'Escapada';

  const intensityInfo = getIntensityInfo(effectiveIntensity);
  const fillPercentage = ((effectiveIntensity - 1) / 9) * 100;
  const glowShadow = `0 0 ${effectiveIntensity * 3.5}px rgba(255, 94, 43, ${intensityInfo.glowAlpha})`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMood || !userLocation) return;

    setIsSubmitting(true);

    const isGpsActive = Boolean(userLocation.isGps);

    const criteria: SearchCriteria = {
      user_mood: selectedMood.label,
      environment: activeEntorno.label,
      company: activeCompany.label,
      budget: `${activeBudget.symbol} ${activeBudget.label}`,
      mobility: activeMobility.label,
      availableTime: activeTime,
      experienceMode: experienceMode || 'chained',
      onlyOpenNow: Boolean(onlyOpenNow),
      allowSurroundings: effectiveAllowSurroundings,
      cityName: userLocation.cityName,
      isGpsActive,
      searchRadiusKm: effectiveSearchRadiusKm,
      latitude: userLocation.lat,
      longitude: userLocation.lng,
      location: {
        lat: userLocation.lat,
        lng: userLocation.lng,
        cityName: userLocation.cityName,
        formattedAddress: userLocation.formattedAddress,
        neighborhood: userLocation.neighborhood,
        isGps: isGpsActive,
        accuracyMeters: userLocation.accuracyMeters,
      },
      intensity: effectiveIntensity,
      ...(moodDescription.trim() && { user_mood_description: moodDescription.trim() }),
    };

    try {
      await handleGenerateItinerary(criteria);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTriggerSurpriseMe = async () => {
    if (!userLocation || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await handleSurpriseMe(userLocation);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSubmitDisabled = !selectedMood || !userLocation || isSubmitting;

  return (
    <div className="flex flex-col h-full bg-[#0F1015] text-white animate-fade-in overflow-hidden select-none">
      {/* Cabecera Editorial */}
      <header className="px-5 py-3.5 sm:py-4 bg-[#0F1015]/90 backdrop-blur-md border-b border-white/[0.08] flex items-center justify-between sticky top-0 z-20 safe-pt">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#FF5E2B] shadow-[0_0_12px_#FF5E2B]"></span>
          <span className="text-xs uppercase tracking-[0.2em] font-extrabold text-white">
            TasteLocal
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPreferencesModalOpen(true)}
            className="text-[11px] font-semibold text-gray-300 hover:text-white bg-white/[0.05] hover:bg-[#FF5E2B]/15 border border-white/10 hover:border-[#FF5E2B]/30 px-2.5 sm:px-3 py-1.5 rounded-full transition flex items-center gap-1.5 cursor-pointer"
            title="Abrir Mi Perfil de Gustos y Sitios Visitados"
          >
            <span>🎛️</span>
            <span className="hidden sm:inline">Mis Preferencias</span>
            {userTasteProfile.manualRestrictions.length + visitedPlaces.length > 0 && (
              <span className="bg-white/15 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full">
                {userTasteProfile.manualRestrictions.length + visitedPlaces.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsSavedPlansModalOpen(true)}
            className="text-[11px] font-semibold text-gray-300 hover:text-white bg-white/[0.05] hover:bg-[#FF5E2B]/15 border border-white/10 hover:border-[#FF5E2B]/30 px-3 py-1.5 rounded-full transition flex items-center gap-1.5 cursor-pointer"
            title="Ver mis experiencias guardadas"
          >
            <span className="text-[#FF5E2B]">❤️</span>
            <span>Mis Planes</span>
            {savedPlans.length > 0 && (
              <span className="bg-[#FF5E2B] text-white text-[9px] font-black px-1.5 py-0.2 rounded-full">
                {savedPlans.length}
              </span>
            )}
          </button>

          <GpsLocationWidget compact />
        </div>
      </header>

      {/* Contenido Principal Simplificado */}
      <main className="flex-grow overflow-y-auto px-5 md:px-8 py-5 space-y-6 scrollbar-hide text-left max-w-4xl mx-auto w-full">
        {/* Widget de Geolocalización GPS en Tiempo Real & Fallback Suave */}
        <GpsLocationWidget />

        {/* Acceso Directo "Decidir juntos (Modo Pareja / Grupo)" */}
        <section>
          <button
            type="button"
            onClick={() => handleStartGroupMode(userLocation || undefined)}
            disabled={!userLocation}
            className="w-full p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-[#FF5E2B]/15 via-white/[0.04] to-transparent border border-[#FF5E2B]/35 hover:border-[#FF5E2B] disabled:opacity-50 transition-all duration-200 flex items-center justify-between gap-3 text-left cursor-pointer group active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#FF5E2B]/20 border border-[#FF5E2B]/40 flex items-center justify-center text-xl flex-shrink-0">
                🫂
              </div>
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-black text-white group-hover:text-[#FF5E2B] transition-colors truncate">
                  Decidir juntos (Modo Pareja / Grupo)
                </h3>
                <p className="text-[11px] text-gray-300 mt-0.5 line-clamp-1">
                  Deslizad 5 propuestas locales en {userLocation?.cityName || 'tu zona'} y haced Match
                </p>
              </div>
            </div>

            <span className="py-1.5 px-3 rounded-xl bg-[#FF5E2B] group-hover:bg-[#E84D1C] text-white text-[11px] font-black whitespace-nowrap shrink-0 flex items-center gap-1 shadow-sm">
              <span>Swipe & Match</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
          </button>
        </section>

        {/* Banner de Aprendizaje Progresivo (Mood Intelligence) */}
        {userAffinities.totalSearches > 0 && (
          <div
            onClick={() => setIsSavedPlansModalOpen(true)}
            className="p-3 rounded-2xl bg-gradient-to-r from-[#FF5E2B]/10 via-white/[0.04] to-transparent border border-[#FF5E2B]/20 hover:border-[#FF5E2B]/40 transition flex items-center justify-between cursor-pointer group"
            title="Ver preferencias y experiencias guardadas"
          >
            <div className="flex items-center gap-2.5 text-xs">
              <span className="text-base">🧠</span>
              <div>
                <span className="font-extrabold text-white group-hover:text-[#FF5E2B] transition-colors">
                  Mood Intelligence Activo:
                </span>{' '}
                <span className="text-gray-300">
                  Ritmo habitual {userAffinities.averageIntensity.toFixed(1)}/10
                  {Object.keys(userAffinities.favoriteEnvironments).length > 0 && (
                    <span> • Entorno afín: {Object.entries(userAffinities.favoriteEnvironments).sort((a,b)=>b[1]-a[1])[0][0]}</span>
                  )}
                </span>
              </div>
            </div>
            <span className="text-[10px] text-[#FF5E2B] font-bold group-hover:underline flex items-center gap-1">
              <span>{userAffinities.totalSavedExperiences} guardados</span>
              <span>→</span>
            </span>
          </div>
        )}

        {/* Paso 1: ¿Cómo te sientes? (6 estados de ánimo actuales, un toque) */}
        <section className="space-y-3">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-[#FF5E2B]">
              Paso 1 de 3
            </span>
            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight mt-0.5">
              ¿Cómo te sientes?
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {NATURAL_MOOD_OPTIONS.map((opt) => {
              const isSelected = selectedMood?.label === opt.label;
              return (
                <button
                  key={opt.phrase}
                  type="button"
                  onClick={() => handleManualMoodSelection(opt)}
                  className={`p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-start gap-3 transform active:scale-[0.98] ${
                    isSelected
                      ? 'bg-[#FF5E2B]/10 border-[#FF5E2B] shadow-[0_0_24px_rgba(255,94,43,0.22)] scale-[1.01]'
                      : 'bg-white/[0.03] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className={`text-2xl p-2 rounded-xl flex-shrink-0 transition-all ${
                    isSelected ? 'bg-[#FF5E2B]/20 text-white' : 'bg-white/[0.05]'
                  }`}>
                    {opt.icon}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-xs md:text-sm font-bold tracking-tight transition-colors ${
                      isSelected ? 'text-[#FF5E2B]' : 'text-white'
                    }`}>
                      {opt.label}
                    </p>
                    <p className="text-[11px] text-gray-400 leading-snug mt-0.5 line-clamp-2">
                      {opt.subtext}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Paso 2: ¿Cuánto tiempo tienes? */}
        <section className="space-y-3">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-[#FF5E2B]">
              Paso 2 de 3
            </span>
            <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
              ¿Cuánto tiempo tienes?
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {AVAILABLE_TIME_OPTIONS.map((timeOpt: AvailableTimeOption) => {
              const isSelected = activeTime === timeOpt.id;

              return (
                <button
                  key={timeOpt.id}
                  type="button"
                  onClick={() => setFormState({ availableTime: timeOpt.id })}
                  className={`p-3.5 rounded-2xl border text-left transition duration-200 cursor-pointer flex items-center gap-3 ${
                    isSelected
                      ? 'bg-[#FF5E2B]/15 border-[#FF5E2B] text-white shadow-[0_0_15px_rgba(255,94,43,0.2)]'
                      : 'bg-white/[0.03] border-white/[0.08] text-gray-300 hover:border-white/20 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="text-xl flex-shrink-0">{timeOpt.icon}</span>
                  <div className="min-w-0">
                    <p className={`text-xs font-bold ${isSelected ? 'text-[#FF5E2B]' : 'text-white'}`}>
                      {getAvailableTimeDisplayLabel(timeOpt)}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {timeOpt.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Paso 3: ¿Con quién vas? */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-widest font-bold text-[#FF5E2B]">
                Paso 3 de 3
              </span>
              <h2 className="text-xl font-black text-white tracking-tight mt-0.5">
                ¿Con quién vas?
              </h2>
            </div>
            <span className="text-[11px] text-gray-400 font-medium">
              {activeCompany.label}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {COMPANY_OPTIONS.map((opt) => {
              const isSelected = activeCompany.label === opt.label;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setFormState({ company: opt })}
                  className={`p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-center gap-2.5 ${
                    isSelected
                      ? 'bg-[#FF5E2B]/15 border-[#FF5E2B] text-white font-bold shadow-[0_0_15px_rgba(255,94,43,0.25)] scale-[1.01]'
                      : 'bg-white/[0.03] border-white/[0.08] text-gray-400 hover:text-white hover:border-white/20 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="text-xl flex-shrink-0">{opt.icon}</span>
                  <span className="text-xs truncate tracking-tight">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* Banner informativo contextual según el tipo de compañía */}
          {activeCompany.label === 'En Familia' && (
            <div className="p-3 rounded-2xl bg-[#FF5E2B]/10 border border-[#FF5E2B]/30 flex items-center gap-2.5 text-xs text-gray-200 animate-fade-in shadow-sm">
              <span className="text-xl flex-shrink-0">👨‍👩‍👧‍👦</span>
              <p className="text-[11px] leading-snug">
                <strong className="text-[#FF5E2B]">Modo En Familia (Multigeneracional):</strong> Priorizamos restaurantes amplios, paseos accesibles sin grandes desniveles, espacios culturales y ritmo pausado disfrutable para todas las edades.
              </p>
            </div>
          )}

          {activeCompany.label === 'Con Niños' && (
            <div className="p-3 rounded-2xl bg-[#FF5E2B]/10 border border-[#FF5E2B]/30 flex items-center gap-2.5 text-xs text-gray-200 animate-fade-in shadow-sm">
              <span className="text-xl flex-shrink-0">🧸</span>
              <p className="text-[11px] leading-snug">
                <strong className="text-[#FF5E2B]">Modo Con Niños (Cero Estrés):</strong> Priorizamos parques con zonas de juego, terrazas peatonalizadas sin tráfico, cafés family-friendly y tiempos de caminata más pausados, evitando locales nocturnos.
              </p>
            </div>
          )}

          {activeCompany.label === 'Con mascota' && (
            <div className="p-3 rounded-2xl bg-[#FF5E2B]/10 border border-[#FF5E2B]/30 flex items-center gap-2.5 text-xs text-gray-200 animate-fade-in shadow-sm">
              <span className="text-xl flex-shrink-0">🐾</span>
              <p className="text-[11px] leading-snug">
                <strong className="text-[#FF5E2B]">Filtro Pet-Friendly Real Activo:</strong> Se verifican parques, jardines y espacios con terrazas aptas para mascotas contrastados con Google Places API.
              </p>
            </div>
          )}
        </section>

        {/* Sección Plegada: Ajustes avanzados (cerrada por defecto) */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <button
            type="button"
            aria-expanded={isAdvancedOpen}
            onClick={() => setIsAdvancedOpen((prev) => !prev)}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.04] transition cursor-pointer"
          >
            <div className="min-w-0">
              <span className="text-xs sm:text-sm font-bold text-white block">
                Ajustes avanzados
              </span>
              <span className="text-[11px] text-gray-400 truncate block mt-0.5">
                {activeEntorno.label} • {activeBudget.symbol} {activeBudget.label} • {activeMobility.label} • {effectiveSearchRadiusKm} km
                {onlyOpenNow ? ' • Solo abiertos' : ''}
              </span>
            </div>

            <svg
              className={`w-4 h-4 text-[#FF5E2B] flex-shrink-0 transition-transform duration-200 ${
                isAdvancedOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isAdvancedOpen && (
            <div className="px-4 pb-5 pt-2 border-t border-white/[0.08] space-y-6 animate-fade-in">
              {/* Modo de Experiencia */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-300">
                    Modo de experiencia
                  </h3>
                  <span className="text-[10px] text-gray-400 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/5">
                    Curaduría adaptativa
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {EXPERIENCE_MODE_OPTIONS.map((opt) => {
                    const isSelected = (experienceMode || 'chained') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setFormState({ experienceMode: opt.id })}
                        className={`p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between gap-2 ${
                          isSelected
                            ? 'bg-[#FF5E2B]/15 border-[#FF5E2B] shadow-[0_0_20px_rgba(255,94,43,0.18)]'
                            : 'bg-white/[0.03] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xl">{opt.icon}</span>
                            <div>
                              <p className={`text-xs font-black ${isSelected ? 'text-[#FF5E2B]' : 'text-white'}`}>
                                {opt.label}
                              </p>
                              <span className="text-[10px] text-gray-400">{opt.badge}</span>
                            </div>
                          </div>
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'border-[#FF5E2B] bg-[#FF5E2B] text-white' : 'border-white/20'
                          }`}>
                            {isSelected && <span className="text-[9px] font-black">✓</span>}
                          </div>
                        </div>
                        <p className="text-[11px] text-gray-300 leading-snug">{opt.subtext}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Entorno Deseado */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-300">
                  Entorno
                </h3>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {ENTORNO_OPTIONS.map((opt) => {
                    const isSelected = activeEntorno.label === opt.label;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setFormState({ entorno: opt })}
                        className={`py-3 px-2 rounded-2xl border text-center transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-[#FF5E2B]/15 border-[#FF5E2B] text-white font-bold shadow-[0_0_16px_rgba(255,94,43,0.22)]'
                            : 'bg-white/[0.03] border-white/[0.08] text-gray-300 hover:border-white/20 hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="text-xl">{opt.icon}</span>
                        <span className="text-[11px] font-bold tracking-tight">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Radio de búsqueda y Alrededores */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-300">
                    Radio de búsqueda
                  </h3>
                  <span className="text-[10px] text-[#FF5E2B] font-semibold">
                    {customRadiusKm === null ? 'Automático según tiempo' : 'Personalizado'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[3, 5, 15].map((km) => {
                    const isSelected = effectiveSearchRadiusKm === km;
                    return (
                      <button
                        key={km}
                        type="button"
                        onClick={() => {
                          setCustomRadiusKm(km);
                          if (km >= 15) setCustomAllowSurroundings(true);
                        }}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                          isSelected
                            ? 'bg-[#FF5E2B]/15 border-[#FF5E2B] text-white shadow-[0_0_12px_rgba(255,94,43,0.2)]'
                            : 'bg-white/[0.03] border-white/[0.08] text-gray-400 hover:text-white hover:border-white/20'
                        }`}
                      >
                        {km} km
                      </button>
                    );
                  })}
                </div>

                {/* Alrededores toggle */}
                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">🚗</span>
                    <div>
                      <p className="text-xs font-bold text-white">Incluir alrededores / escapada</p>
                      <p className="text-[11px] text-gray-400 leading-snug">
                        Amplía propuestas hacia el entorno próximo de {userLocation?.cityName || 'tu ubicación'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={effectiveAllowSurroundings}
                    onClick={() => {
                      const next = !effectiveAllowSurroundings;
                      setCustomAllowSurroundings(next);
                      if (next && effectiveSearchRadiusKm < 15) {
                        setCustomRadiusKm(15);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      effectiveAllowSurroundings ? 'bg-[#FF5E2B] shadow-[0_0_12px_rgba(255,94,43,0.4)]' : 'bg-white/20'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        effectiveAllowSurroundings ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Presupuesto */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-300">
                    Presupuesto orientativo
                  </h3>
                  <span className="text-[10px] text-[#FF5E2B] font-medium">
                    {activeBudget.description}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {BUDGET_OPTIONS.map((opt) => {
                    const isSelected = activeBudget.label === opt.label;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setFormState({ budget: opt })}
                        className={`p-2.5 rounded-xl border text-center transition duration-200 cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          isSelected
                            ? 'bg-[#FF5E2B]/15 border-[#FF5E2B] text-white font-bold shadow-[0_0_12px_rgba(255,94,43,0.2)]'
                            : 'bg-white/[0.03] border-white/[0.08] text-gray-400 hover:text-white hover:border-white/20'
                        }`}
                      >
                        <span className="text-sm font-black text-[#FF5E2B]">{opt.symbol}</span>
                        <span className="text-[11px] tracking-tight">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Movilidad */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-300">
                  Movilidad
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {MOBILITY_OPTIONS.map((opt) => {
                    const isSelected = activeMobility.label === opt.label;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setFormState({ mobility: opt })}
                        className={`p-2.5 rounded-xl border text-center transition duration-200 cursor-pointer flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-[#FF5E2B]/15 border-[#FF5E2B] text-white font-bold shadow-[0_0_12px_rgba(255,94,43,0.2)]'
                            : 'bg-white/[0.03] border-white/[0.08] text-gray-400 hover:text-white hover:border-white/20'
                        }`}
                      >
                        <span className="text-lg">{opt.icon}</span>
                        <span className="text-[11px] tracking-tight">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dial de Intensidad (1 al 10) */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-300">
                    Intensidad y ritmo
                  </h3>
                  <span className="text-[10px] text-[#FF5E2B] font-semibold">
                    {hasCustomIntensity ? 'Manual' : 'Según tu ánimo'}
                  </span>
                </div>

                <div
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3 transition-all duration-300"
                  style={{ boxShadow: glowShadow }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-white tracking-wide flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#FF5E2B]"></span>
                        {intensityInfo.label}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                        {intensityInfo.description}
                      </p>
                    </div>

                    <div
                      className="w-9 h-9 rounded-xl bg-[#0F1015] border border-[#FF5E2B]/40 flex items-center justify-center font-black text-sm text-[#FF5E2B] flex-shrink-0"
                      style={{ boxShadow: `0 0 15px rgba(255, 94, 43, ${intensityInfo.glowAlpha})` }}
                    >
                      {effectiveIntensity}
                    </div>
                  </div>

                  <div className="relative pt-1 space-y-2">
                    <div className="relative w-full h-3 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#FF8A65] to-[#FF5E2B] transition-all duration-150 rounded-full"
                        style={{ width: `${fillPercentage}%` }}
                      ></div>
                    </div>
                    <input
                      id="intensity-dial"
                      type="range"
                      min="1"
                      max="10"
                      value={effectiveIntensity}
                      onChange={(e) => {
                        setHasCustomIntensity(true);
                        setFormState({ intensity: Number(e.target.value) });
                      }}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      <span>1 • Pausado</span>
                      <span>5 • Equilibrado</span>
                      <span>10 • Vigoroso</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filtro en Vivo: Solo Abiertos Ahora */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#FF5E2B]/40 transition-all duration-300 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all ${
                      onlyOpenNow
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                        : 'bg-white/5 text-gray-400 border border-white/5'
                    }`}
                  >
                    <span>🕒</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-white tracking-tight">Solo abiertos ahora</p>
                      {onlyOpenNow && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                          En vivo
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400 leading-snug">
                      Filtra y descarta locales que estén cerrados en este momento
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(onlyOpenNow)}
                  onClick={() => setFormState({ onlyOpenNow: !onlyOpenNow })}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    onlyOpenNow ? 'bg-[#FF5E2B] shadow-[0_0_12px_rgba(255,94,43,0.4)]' : 'bg-white/20'
                  }`}
                  title={onlyOpenNow ? 'Desactivar filtro solo abiertos ahora' : 'Activar filtro solo abiertos ahora'}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      onlyOpenNow ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Expresión Libre: Entrada de Voz o Texto (Opcional) */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-300">
                  Nota libre o por voz (opcional)
                </h3>
                <textarea
                  id="mood-free-text"
                  value={moodDescription}
                  onChange={(e) => setFormState({ moodDescription: e.target.value })}
                  placeholder="Cuéntanos algún detalle extra: 'Terraza soleada', 'Paseo tranquilo junto al agua'..."
                  className="w-full p-3 bg-white/[0.04] border border-white/10 rounded-2xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FF5E2B] transition-colors leading-relaxed"
                  rows={2}
                />

                <button
                  type="button"
                  onClick={handleListen}
                  disabled={voiceInputStatus === 'processing'}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-medium text-gray-300 hover:text-white transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {voiceInputStatus === 'listening' ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                      <span className="text-red-400 font-bold">Escuchando tu voz... Háblame con naturalidad</span>
                    </>
                  ) : voiceInputStatus === 'processing' ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-[#FF5E2B] border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-[#FF5E2B] font-semibold">Gemini está interpretando tu tono...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      <span>Contar por voz en lenguaje natural</span>
                    </>
                  )}
                </button>

                {voiceConfirmation && (
                  <p className="text-xs text-[#FF5E2B] font-semibold text-center bg-[#FF5E2B]/10 border border-[#FF5E2B]/20 py-2 px-3 rounded-xl animate-fade-in">
                    {voiceConfirmation}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Pie discreto: Recomendar App & Versión */}
        <div className="pt-2 pb-1 border-t border-white/[0.06] flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleRecommendApp}
            className="text-xs font-semibold text-gray-400 hover:text-[#FF5E2B] transition flex items-center gap-1.5 py-1.5 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span>{appShareFeedback || 'Compartir TasteLocal Living'}</span>
          </button>

          <span className="text-[11px] font-mono text-gray-500">
            v1.0 Production
          </span>
        </div>
      </main>

      {/* Botón grande para generar el plan + Botón secundario Sorpréndeme */}
      <footer className="p-4 md:p-5 bg-[#0F1015]/95 border-t border-white/[0.08] backdrop-blur-md safe-pb">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5 max-w-4xl mx-auto">
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="flex-1 py-4 px-6 rounded-2xl font-black text-sm tracking-wide bg-[#FF5E2B] hover:bg-[#E84D1C] disabled:bg-white/10 text-white disabled:text-gray-500 shadow-[0_8px_24px_rgba(255,94,43,0.35)] transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-2.5 cursor-pointer disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2.5 text-white animate-fade-in">
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                <span className="text-xs font-bold">Creando tus 3 propuestas...</span>
              </div>
            ) : (
              <>
                <span>Descubrir mis 3 propuestas</span>
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleTriggerSurpriseMe}
            disabled={!userLocation || isSubmitting}
            className="sm:w-auto py-3.5 px-5 rounded-2xl font-bold text-xs sm:text-sm bg-white/[0.06] hover:bg-[#FF5E2B]/15 border border-white/15 hover:border-[#FF5E2B]/50 text-white disabled:opacity-40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
          >
            <span>⚡</span>
            <span>Sorpréndeme</span>
          </button>
        </form>
      </footer>

      {/* Modal de Experiencias Guardadas */}
      {isSavedPlansModalOpen && (
        <Suspense fallback={null}>
          <SavedPlansModal
            isOpen={isSavedPlansModalOpen}
            onClose={() => setIsSavedPlansModalOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default HomePage;
