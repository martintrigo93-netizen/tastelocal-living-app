import React, { useState, useEffect } from 'react';

interface LoadingStateProps {
  currentStep?: string;
}

const EMOTIONAL_MESSAGES = [
  {
    phase: 'Sintonía Emocional',
    message: 'Analizando el clima y la energía de tu zona...',
    detail: 'Mapeando la atmósfera meteorológica y el ritmo de la ciudad',
    progress: 22,
  },
  {
    phase: 'Curaduría Local',
    message: 'Buscando rincones auténticos cerca de ti...',
    detail: 'Consultando espacios independientes y establecimientos con alma',
    progress: 48,
  },
  {
    phase: 'Filtrado de Calidad',
    message: 'Verificando distancias reales y espacios genuinos...',
    detail: 'Evitando trampas turísticas y priorizando identidad de barrio',
    progress: 74,
  },
  {
    phase: 'Creación Editorial',
    message: 'Diseñando tu experiencia ideal y optimizando rutas...',
    detail: 'Trazando el itinerario perfecto para que fluya sin prisas',
    progress: 92,
  },
];

const LoadingState: React.FC<LoadingStateProps> = ({ currentStep }) => {
  const [activeMessageIdx, setActiveMessageIdx] = useState<number>(0);

  // Cycle through emotional messages smoothly
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveMessageIdx((prev) => (prev + 1) % EMOTIONAL_MESSAGES.length);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  const activeInfo = EMOTIONAL_MESSAGES[activeMessageIdx];
  const displayTitle = currentStep || activeInfo.message;

  return (
    <div className="flex flex-col h-full bg-[#0F1015] text-white animate-fade-in select-none overflow-y-auto scrollbar-hide text-left">
      {/* Top Progress Bar */}
      <div className="w-full bg-white/[0.04] h-1.5 overflow-hidden sticky top-0 z-20">
        <div
          className="h-full bg-gradient-to-r from-[#FF5E2B] to-[#FF8C66] transition-all duration-700 ease-out shadow-[0_0_12px_rgba(255,94,43,0.8)]"
          style={{ width: `${activeInfo.progress}%` }}
        />
      </div>

      {/* Header with Emotional Loading Message */}
      <div className="px-5 sm:px-8 pt-6 pb-4 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
        <div className="max-w-4xl mx-auto space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5E2B] animate-ping" />
            <span className="text-[10px] font-black uppercase tracking-widest text-[#FF5E2B]">
              {activeInfo.phase}
            </span>
            <span className="text-gray-500 text-xs">•</span>
            <span className="text-xs text-gray-400 font-mono">
              {activeInfo.progress}% completado
            </span>
          </div>

          <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight leading-snug transition-all duration-300">
            {displayTitle}
          </h2>

          <p className="text-xs text-gray-400 font-medium leading-relaxed max-w-xl transition-all duration-300">
            {activeInfo.detail}
          </p>
        </div>
      </div>

      {/* Shimmering Skeleton Screen of the 3 Proposals & Active Plan */}
      <div className="px-5 sm:px-8 py-6 max-w-4xl mx-auto w-full space-y-6">
        {/* 3 Proposals Selector Skeleton */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="h-3 w-36 rounded-md skeleton-shimmer" />
            <div className="h-3 w-20 rounded-md skeleton-shimmer" />
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`p-3 sm:p-4 rounded-2xl border transition-all ${
                  i === 0
                    ? 'bg-[#FF5E2B]/10 border-[#FF5E2B]/40 shadow-[0_0_20px_rgba(255,94,43,0.15)]'
                    : 'bg-white/[0.02] border-white/5'
                }`}
              >
                <div className="w-7 h-7 mx-auto rounded-xl skeleton-shimmer mb-2" />
                <div className="h-3.5 w-16 sm:w-20 mx-auto rounded-md skeleton-shimmer mb-1.5" />
                <div className="h-2 w-12 sm:w-16 mx-auto rounded-md skeleton-shimmer opacity-60" />
              </div>
            ))}
          </div>
        </div>

        {/* Main Card Skeleton Preview */}
        <div className="p-5 sm:p-6 rounded-3xl bg-white/[0.02] border border-white/10 shadow-2xl space-y-5">
          {/* Badge & Quick Stats Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="h-6 w-24 rounded-full skeleton-shimmer" />
              <div className="h-5 w-28 rounded-full skeleton-shimmer opacity-80" />
              <div className="h-5 w-16 rounded-full skeleton-shimmer opacity-60" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-7 w-20 rounded-xl skeleton-shimmer" />
              <div className="h-7 w-24 rounded-xl skeleton-shimmer" />
            </div>
          </div>

          {/* Title and Short Description Shimmers */}
          <div className="space-y-2">
            <div className="h-7 w-3/4 rounded-xl skeleton-shimmer" />
            <div className="h-4 w-full rounded-lg skeleton-shimmer opacity-75" />
            <div className="h-4 w-2/3 rounded-lg skeleton-shimmer opacity-60" />
          </div>

          {/* Emotional Rationale Shimmer Box ("Por qué conecta con cómo te sientes hoy") */}
          <div className="p-4 rounded-2xl bg-[#FF5E2B]/[0.05] border border-[#FF5E2B]/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-48 rounded-md skeleton-shimmer" />
              <div className="h-6 w-28 rounded-xl skeleton-shimmer opacity-75" />
            </div>
            <div className="h-3 w-full rounded-md skeleton-shimmer opacity-70" />
            <div className="h-3 w-4/5 rounded-md skeleton-shimmer opacity-50" />
          </div>

          {/* Stops Shimmer List (3 Places) */}
          <div className="space-y-3 pt-1">
            <div className="h-3 w-40 rounded-md skeleton-shimmer" />

            <div className="space-y-3">
              {[0, 1, 2].map((idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3.5 w-full sm:w-auto">
                    {/* Thumbnail placeholder */}
                    <div className="w-16 h-16 rounded-xl skeleton-shimmer flex-shrink-0" />

                    {/* Place info placeholder */}
                    <div className="space-y-2 flex-grow min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-12 rounded-md skeleton-shimmer" />
                        <div className="h-4 w-28 rounded-md skeleton-shimmer opacity-75" />
                      </div>
                      <div className="h-4 w-40 sm:w-56 rounded-md skeleton-shimmer" />
                      <div className="h-3 w-32 sm:w-48 rounded-md skeleton-shimmer opacity-50" />
                    </div>
                  </div>

                  {/* Quick Action Button placeholder */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <div className="h-8 w-24 rounded-xl skeleton-shimmer" />
                    <div className="h-8 w-16 rounded-xl skeleton-shimmer opacity-60" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Action Bar Skeleton */}
          <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="h-12 rounded-2xl skeleton-shimmer" />
            <div className="h-12 rounded-2xl skeleton-shimmer opacity-80" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingState;
