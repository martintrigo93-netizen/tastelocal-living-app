import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { type SavedExperience } from '../types';
import { getGoogleMapsDrivingRouteUrl, getGoogleMapsWalkingRouteUrl } from './Map';

interface SavedPlansModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const formatDate = (isoString: string): string => {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Reciente';
  }
};

const SavedPlansModal: React.FC<SavedPlansModalProps> = ({ isOpen, onClose }) => {
  const {
    savedPlans,
    removeSavedPlan,
    clearSavedPlans,
    openSavedPlan,
    userAffinities,
    userTasteProfile,
    visitedPlaces,
    setIsPreferencesModalOpen,
  } = useAppContext();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [confirmClear, setConfirmClear] = useState<boolean>(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredPlans = savedPlans.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = item.plan.title.toLowerCase().includes(q);
    const descMatch = item.plan.shortDescription.toLowerCase().includes(q);
    const cityMatch = item.cityContext?.toLowerCase().includes(q);
    const stopMatch = item.plan.schedule.some((s) => s.placeName.toLowerCase().includes(q));
    return titleMatch || descMatch || cityMatch || stopMatch;
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in text-left select-none"
    >
      <div className="relative w-full max-w-xl max-h-[90vh] sm:max-h-[88vh] bg-[#0F1015] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden safe-pb">
        {/* Mobile Drag Handle */}
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5 mb-1 sm:hidden flex-shrink-0" />

        {/* Header */}
        <div className="px-5 py-3.5 sm:py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#0F1015]/95">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#FF5E2B]/15 text-[#FF5E2B] flex items-center justify-center text-sm font-bold border border-[#FF5E2B]/20 shadow-sm">
              ❤️
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="saved-modal-title" className="text-base font-extrabold text-white tracking-tight">
                  Mis Experiencias Guardadas
                </h3>
                <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.2 rounded-full">
                  ⚡ 100% Offline
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                {savedPlans.length} {savedPlans.length === 1 ? 'plan conservado' : 'planes conservados'} en tu dispositivo local
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Cerrar modal"
            aria-label="Cerrar modal"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mood Intelligence Banner & Access to Mis Preferencias */}
        <div className="px-5 py-2.5 bg-gradient-to-r from-[#FF5E2B]/10 via-white/[0.03] to-transparent border-b border-white/[0.06] flex items-center justify-between gap-2 text-[11px] text-gray-300">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm flex-shrink-0">🧠</span>
            <span className="font-semibold text-white flex-shrink-0">Mood Intelligence:</span>
            <span className="text-gray-400 truncate">
              Ritmo <strong className="text-[#FF5E2B] font-bold">{userAffinities.averageIntensity.toFixed(1)}/10</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              setIsPreferencesModalOpen(true);
            }}
            className="text-[11px] font-bold text-[#FF5E2B] hover:text-white bg-[#FF5E2B]/15 hover:bg-[#FF5E2B] border border-[#FF5E2B]/30 px-2.5 py-1 rounded-lg transition flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
          >
            <span>🎛️</span>
            <span>Mis Preferencias</span>
            {userTasteProfile.manualRestrictions.length + visitedPlaces.length > 0 && (
              <span className="text-[9px] bg-black/30 px-1.5 rounded-full text-white">
                {userTasteProfile.manualRestrictions.length + visitedPlaces.length}
              </span>
            )}
          </button>
        </div>

        {/* Search bar when plans exist */}
        {savedPlans.length > 2 && (
          <div className="px-5 pt-3 pb-1">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por lugar, ciudad o actividad..."
                className="w-full py-2 px-3 pl-8 text-xs bg-white/[0.04] border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-[#FF5E2B] transition"
              />
              <svg
                className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
        )}

        {/* Content list */}
        <div className="flex-grow overflow-y-auto p-5 space-y-3.5 scrollbar-hide">
          {savedPlans.length === 0 ? (
            <div className="py-14 px-4 text-center space-y-3.5">
              <div className="w-16 h-16 rounded-3xl bg-white/[0.03] border border-white/10 text-gray-400 flex items-center justify-center text-3xl mx-auto shadow-inner">
                💌
              </div>
              <h4 className="text-base font-extrabold text-white">Aún no has guardado experiencias</h4>
              <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
                Pulsa el botón <strong className="text-[#FF5E2B]">🤍 Guardar</strong> en cualquiera de las propuestas del módulo Discover para conservarla de forma privada en tu dispositivo sin registrarte.
              </p>
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400">
              No se han encontrado experiencias guardadas que coincidan con "{searchQuery}".
            </div>
          ) : (
            filteredPlans.map((saved: SavedExperience) => {
              const drivingRouteUrl = getGoogleMapsDrivingRouteUrl(saved.plan.schedule);
              const walkingRouteUrl = getGoogleMapsWalkingRouteUrl(saved.plan.schedule);

              return (
                <div
                  key={saved.id}
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#FF5E2B]/40 transition space-y-3 group"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-black text-[#FF5E2B] bg-[#FF5E2B]/10 px-2 py-0.5 rounded-md border border-[#FF5E2B]/20">
                        {saved.plan.badge || 'PLAN'}
                      </span>
                      {saved.cityContext && (
                        <span className="text-gray-400 bg-white/5 px-2 py-0.5 rounded-md">
                          📍 {saved.cityContext}
                        </span>
                      )}
                    </div>
                    <span className="text-gray-500">{formatDate(saved.savedAt)}</span>
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h4 className="text-sm font-bold text-white tracking-tight">{saved.plan.title}</h4>
                    <p className="text-xs text-gray-300 line-clamp-2 mt-1 leading-relaxed">
                      {saved.plan.shortDescription}
                    </p>
                  </div>

                  {/* Narrative snippet */}
                  {saved.plan.matchReason && (
                    <p className="text-[11px] text-gray-400 italic bg-white/[0.02] p-2.5 rounded-xl border border-white/5 leading-snug">
                      "{saved.plan.matchReason}"
                    </p>
                  )}

                  {/* Stops preview */}
                  <div className="flex items-center gap-3 text-[11px] text-gray-400 pt-0.5 flex-wrap">
                    <span>📍 {saved.plan.schedule.length} paradas verificadas</span>
                    <span>•</span>
                    <span>⏱️ {saved.plan.approxDuration}</span>
                    {saved.plan.budgetEstimate && (
                      <>
                        <span>•</span>
                        <span>💶 {saved.plan.budgetEstimate}</span>
                      </>
                    )}
                  </div>

                  {/* Action Buttons: Direct Google Maps & Open Experience */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.06] flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => removeSavedPlan(saved.id)}
                      className="text-xs text-gray-400 hover:text-red-400 transition flex items-center gap-1 cursor-pointer py-1 px-1.5"
                      title="Eliminar de guardados"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span>Eliminar</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      {/* Deep Link to Driving Route in Google Maps */}
                      <a
                        href={drivingRouteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-1.5 px-2.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/15 text-gray-200 hover:text-white border border-white/10 transition cursor-pointer flex items-center gap-1"
                        title="Iniciar ruta continua en Google Maps (coche)"
                      >
                        <span>🚗 Mapa</span>
                      </a>

                      {/* Deep Link to Walking Route in Google Maps */}
                      <a
                        href={walkingRouteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-1.5 px-2.5 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/15 text-gray-200 hover:text-white border border-white/10 transition cursor-pointer flex items-center gap-1"
                        title="Iniciar ruta continua en Google Maps (a pie)"
                      >
                        <span>🚶 A pie</span>
                      </a>

                      {/* Open experience in detail view */}
                      <button
                        type="button"
                        onClick={() => openSavedPlan(saved)}
                        className="py-1.5 px-3.5 rounded-xl text-xs font-bold bg-[#FF5E2B] hover:bg-[#E84D1C] text-white transition shadow-sm cursor-pointer flex items-center gap-1.5"
                      >
                        <span>Abrir plan</span>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info & Clear History */}
        <div className="p-3 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-between text-left">
          <p className="text-[10px] text-gray-500">
            Almacenamiento 100% privado en tu navegador (sin registros).
          </p>

          {savedPlans.length > 0 && (
            <div>
              {confirmClear ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-red-400 font-bold">¿Borrar todos?</span>
                  <button
                    type="button"
                    onClick={() => {
                      clearSavedPlans();
                      setConfirmClear(false);
                    }}
                    className="text-[10px] font-bold text-red-400 hover:text-red-300 underline cursor-pointer"
                  >
                    Sí, vaciar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="text-[10px] text-gray-400 hover:text-white cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="text-[10px] text-gray-400 hover:text-red-400 transition cursor-pointer"
                >
                  Vaciar historial
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SavedPlansModal;
