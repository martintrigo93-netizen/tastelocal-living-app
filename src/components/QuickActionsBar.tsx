import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { type ProposalPlan, type ScheduleItem } from '../types';
import { getGoogleMapsDrivingRouteUrl, getGoogleMapsWalkingRouteUrl } from '../utils/mapLinks';

interface QuickActionsBarProps {
  plan: ProposalPlan;
  onOpenShareModal?: () => void;
  className?: string;
  size?: 'normal' | 'compact';
}

/**
 * Acciones Rápidas (1-Tap) con accesibilidad táctil para el pulgar (min-h-[44px]):
 * 1. "Cómo llegar": Abre Google Maps / Apple Maps con las coordenadas exactas.
 * 2. "Guardar plan": Marca como favorita la experiencia en localStorage (sin conexión).
 * 3. "Compartir": Lanza directamente la Web Share API nativa (navigator.share).
 */
export const QuickActionsBar: React.FC<QuickActionsBarProps> = ({
  plan,
  onOpenShareModal,
  className = '',
  size = 'normal',
}) => {
  const { savePlan, removeSavedPlan, isPlanSaved } = useAppContext();
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const isSaved = isPlanSaved(plan.id);

  // Determinar URL óptima de "Cómo llegar" (Google Maps / Apple Maps)
  const getDestinationUrl = (): string => {
    const firstStopWithLocation = plan.schedule.find((s) => s.location && s.location.lat && s.location.lng);
    if (firstStopWithLocation?.location) {
      const { lat, lng } = firstStopWithLocation.location;
      // Universal directions URL supported by iOS (Apple Maps prompt) and Android (Google Maps app)
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
    }

    if (plan.schedule.length > 0) {
      return getGoogleMapsWalkingRouteUrl(plan.schedule);
    }

    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plan.title)}`;
  };

  // 1-Tap Guardar Plan en localStorage
  const handleToggleSave = () => {
    // Haptic feedback en dispositivos móviles compatibles
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(35);
      } catch {
        // Ignorar si el navegador bloquea vibración
      }
    }

    if (isSaved) {
      removeSavedPlan(plan.id);
      showToast('Plan eliminado de Guardados');
    } else {
      savePlan(plan);
      showToast('❤️ ¡Plan guardado para ver sin conexión!');
    }
  };

  // 1-Tap Compartir Nativo (navigator.share)
  const handleShare = async () => {
    const stopsList = plan.schedule
      .slice(0, 3)
      .map((s, idx) => `  ${idx + 1}. ${s.placeName} (${s.time})`)
      .join('\n');

    const shareData = {
      title: `TasteLocal: ${plan.title}`,
      text: `✨ TasteLocal Living\n«${plan.tagline}»\n\n📍 ${plan.title} (${plan.badge})\n⏱️ ${plan.approxDuration} • 💶 ${plan.budgetEstimate || '20€ - 35€'}\n\nParadas principales:\n${stopsList}\n\n💡 "${plan.matchReason}"\n\nPlanificado en TasteLocal: ${window.location.origin}`,
      url: window.location.origin,
    };

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: unknown) {
        // Si el usuario canceló el share nativo, no hacemos nada
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        console.warn('Native share failed or dismissed, opening visual modal:', err);
      }
    }

    // Fallback: abrir modal de tarjeta postal visual o copiar
    if (onOpenShareModal) {
      onOpenShareModal();
    } else {
      try {
        await navigator.clipboard.writeText(shareData.text);
        showToast('✓ ¡Plan copiado al portapapeles!');
      } catch {
        showToast('No se pudo compartir');
      }
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2600);
  };

  const destinationUrl = getDestinationUrl();
  const isCompact = size === 'compact';

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-2 rounded-xl bg-[#FF5E2B]/20 border border-[#FF5E2B]/50 text-white text-xs font-bold text-center animate-fade-in shadow-md">
          {toastMessage}
        </div>
      )}

      {/* 1-Tap Quick Action Buttons Bar */}
      <div className="grid grid-cols-3 gap-2">
        {/* Botón 1: Cómo llegar */}
        <a
          href={destinationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center justify-center gap-1.5 px-3 rounded-2xl font-bold text-xs transition duration-200 cursor-pointer shadow-sm select-none ${
            isCompact ? 'py-2.5 min-h-[40px]' : 'py-3 min-h-[46px]'
          } bg-[#FF5E2B] hover:bg-[#E84D1C] text-white active:scale-95`}
          title="Abrir ubicación o ruta en Google Maps / Apple Maps"
        >
          <span className="text-sm">🧭</span>
          <span className="truncate">Cómo llegar</span>
        </a>

        {/* Botón 2: Guardar plan */}
        <button
          type="button"
          onClick={handleToggleSave}
          className={`flex items-center justify-center gap-1.5 px-3 rounded-2xl font-bold text-xs transition duration-200 cursor-pointer shadow-sm select-none border ${
            isCompact ? 'py-2.5 min-h-[40px]' : 'py-3 min-h-[46px]'
          } ${
            isSaved
              ? 'bg-[#FF5E2B]/25 border-[#FF5E2B] text-[#FF5E2B] shadow-[0_0_15px_rgba(255,94,43,0.25)]'
              : 'bg-white/[0.05] hover:bg-white/[0.1] border-white/10 hover:border-white/20 text-gray-200 hover:text-white'
          } active:scale-95`}
          title={isSaved ? 'Plan guardado en tu dispositivo' : 'Guardar plan en favoritos para consultar sin conexión'}
        >
          <span className={`text-sm ${isSaved ? 'animate-bounce text-[#FF5E2B]' : ''}`}>
            {isSaved ? '❤️' : '🤍'}
          </span>
          <span className="truncate">{isSaved ? 'Guardado' : 'Guardar plan'}</span>
        </button>

        {/* Botón 3: Compartir (Web Share API) */}
        <button
          type="button"
          onClick={handleShare}
          className={`flex items-center justify-center gap-1.5 px-3 rounded-2xl font-bold text-xs transition duration-200 cursor-pointer shadow-sm select-none border bg-white/[0.05] hover:bg-white/[0.1] border-white/10 hover:border-[#FF5E2B]/40 text-gray-200 hover:text-white active:scale-95 ${
            isCompact ? 'py-2.5 min-h-[40px]' : 'py-3 min-h-[46px]'
          }`}
          title="Compartir plan por WhatsApp o mensaje con Web Share API"
        >
          <svg className="w-4 h-4 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.2"
              d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
            />
          </svg>
          <span className="truncate">Compartir</span>
        </button>
      </div>
    </div>
  );
};

export default QuickActionsBar;
