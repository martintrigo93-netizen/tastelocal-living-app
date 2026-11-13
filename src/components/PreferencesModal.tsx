import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';

interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_RESTRICTIONS = [
  { label: 'Opciones sin gluten', icon: '🌾' },
  { label: 'Pet-friendly', icon: '🐾' },
  { label: 'Evitar multitudes', icon: '🤫' },
  { label: 'Espacios tranquilos', icon: '🌿' },
  { label: 'Opciones vegetarianas / veganas', icon: '🥗' },
  { label: 'Terrazas al aire libre', icon: '☀️' },
  { label: 'Café de especialidad', icon: '☕' },
  { label: 'Accesibilidad sin barreras', icon: '♿' },
];

const formatShortDate = (isoString: string): string => {
  try {
    return new Date(isoString).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return 'Reciente';
  }
};

const PreferencesModal: React.FC<PreferencesModalProps> = ({ isOpen, onClose }) => {
  const {
    userTasteProfile,
    visitedPlaces,
    toggleManualRestriction,
    removeVisitedPlace,
    clearVisitedPlaces,
    resetTasteProfile,
  } = useAppContext();

  const [customRestriction, setCustomRestriction] = useState('');
  const [confirmResetVisited, setConfirmResetVisited] = useState(false);
  const [confirmResetProfile, setConfirmResetProfile] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string>('');

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

  const topCategories = Object.entries(userTasteProfile.preferredCategories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const topMoods = Object.entries(userTasteProfile.preferredMoods)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const handleAddCustomRestriction = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customRestriction.trim();
    if (!cleaned) return;
    if (!userTasteProfile.manualRestrictions.includes(cleaned)) {
      toggleManualRestriction(cleaned);
    }
    setCustomRestriction('');
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
      setShareFeedback('✓ Enlace copiado');
      setTimeout(() => setShareFeedback(''), 2500);
    } catch {
      setShareFeedback('Enlace listo');
      setTimeout(() => setShareFeedback(''), 2000);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preferences-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in text-left select-none"
    >
      <div className="relative w-full max-w-xl max-h-[90vh] sm:max-h-[88vh] bg-[#0F1015] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden safe-pb">
        {/* Mobile Drag Handle */}
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-2.5 mb-1 sm:hidden flex-shrink-0" />

        {/* Header */}
        <div className="px-5 py-3.5 sm:py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#0F1015]/95">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#FF5E2B]/15 text-[#FF5E2B] flex items-center justify-center text-base font-bold border border-[#FF5E2B]/30 shadow-sm">
              🎛️
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="preferences-modal-title" className="text-base font-extrabold text-white tracking-tight">
                  Mi Perfil de Gustos
                </h3>
                <span className="text-[10px] font-bold bg-[#FF5E2B]/15 text-[#FF5E2B] border border-[#FF5E2B]/30 px-2 py-0.2 rounded-full">
                  Memoria Local
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                Transparencia y control total sobre lo que aprende la app
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Cerrar preferencias"
            aria-label="Cerrar preferencias"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-grow overflow-y-auto p-5 space-y-6 scrollbar-hide">
          {/* Sección 1: Lo que TasteLocal ha aprendido */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">🧠</span>
                <h4 className="text-xs uppercase tracking-widest font-black text-[#FF5E2B]">
                  Aprendizaje Silencioso ({userTasteProfile.totalInteractions} interacciones)
                </h4>
              </div>

              {userTasteProfile.totalInteractions > 0 && (
                <div>
                  {confirmResetProfile ? (
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => {
                          resetTasteProfile();
                          setConfirmResetProfile(false);
                        }}
                        className="text-red-400 font-bold underline cursor-pointer"
                      >
                        Confirmar reinicio
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmResetProfile(false)}
                        className="text-gray-400 hover:text-white cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmResetProfile(true)}
                      className="text-[10px] text-gray-400 hover:text-red-400 transition cursor-pointer"
                    >
                      Reiniciar perfil
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#FF5E2B]/10 via-white/[0.03] to-transparent border border-[#FF5E2B]/25 space-y-3">
              <p className="text-xs text-gray-100 leading-relaxed italic">
                "{userTasteProfile.summary}"
              </p>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                    Ritmo habitual
                  </p>
                  <p className="text-sm font-black text-white mt-0.5">
                    {userTasteProfile.averageEnergy.toFixed(1)} <span className="text-[11px] font-normal text-[#FF5E2B]">/ 10</span>
                  </p>
                </div>

                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                    Entorno favorito
                  </p>
                  <p className="text-sm font-black text-white mt-0.5 truncate">
                    {topCategories.length > 0 ? topCategories[0][0] : 'Por descubrir'}
                  </p>
                </div>
              </div>

              {(topCategories.length > 0 || topMoods.length > 0 || userTasteProfile.recurringPreferences.length > 0) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {topCategories.map(([cat]) => (
                    <span
                      key={`cat-${cat}`}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/10 text-white border border-white/10"
                    >
                      📍 {cat}
                    </span>
                  ))}
                  {topMoods.map(([mood]) => (
                    <span
                      key={`mood-${mood}`}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[#FF5E2B]/15 text-[#FF5E2B] border border-[#FF5E2B]/25"
                    >
                      ✨ {mood}
                    </span>
                  ))}
                  {userTasteProfile.recurringPreferences.map((pref) => (
                    <span
                      key={`pref-${pref}`}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/25"
                    >
                      ✓ {pref}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Sección 2: Restricciones rápidas manuales */}
          <section className="space-y-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm">⚡</span>
                <h4 className="text-xs uppercase tracking-widest font-black text-white">
                  Restricciones y Preferencias Rápidas
                </h4>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Activa reglas permanentes que Gemini respetará en cada búsqueda.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {QUICK_RESTRICTIONS.map((item) => {
                const isActive = userTasteProfile.manualRestrictions.includes(item.label);
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => toggleManualRestriction(item.label)}
                    className={`py-1.5 px-3 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? 'bg-[#FF5E2B] border-[#FF5E2B] text-white shadow-[0_0_14px_rgba(255,94,43,0.35)]'
                        : 'bg-white/[0.03] border-white/10 text-gray-300 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}

              {/* Custom restrictions already added */}
              {userTasteProfile.manualRestrictions
                .filter((r) => !QUICK_RESTRICTIONS.some((qr) => qr.label === r))
                .map((custom) => (
                  <button
                    key={custom}
                    type="button"
                    onClick={() => toggleManualRestriction(custom)}
                    className="py-1.5 px-3 rounded-xl border text-xs font-bold bg-[#FF5E2B] border-[#FF5E2B] text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>✓</span>
                    <span>{custom}</span>
                    <span className="ml-1 opacity-75">×</span>
                  </button>
                ))}
            </div>

            {/* Añadir preferencia personalizada */}
            <form onSubmit={handleAddCustomRestriction} className="flex gap-2 pt-1">
              <input
                type="text"
                value={customRestriction}
                onChange={(e) => setCustomRestriction(e.target.value)}
                placeholder="Añadir otra preferencia (ej. 'Sin lactosa', 'Música en directo')..."
                className="flex-grow py-2 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#FF5E2B] transition"
              />
              <button
                type="submit"
                disabled={!customRestriction.trim()}
                className="py-2 px-3.5 rounded-xl bg-white/10 hover:bg-[#FF5E2B] disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer"
              >
                Añadir
              </button>
            </form>
          </section>

          {/* Sección 3: Historial de Sitios Ya Visitados */}
          <section className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">✅</span>
                  <h4 className="text-xs uppercase tracking-widest font-black text-white">
                    Sitios Ya Visitados ({visitedPlaces.length})
                  </h4>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Excluidos automáticamente para descubrir siempre lugares nuevos.
                </p>
              </div>

              {visitedPlaces.length > 0 && (
                <div>
                  {confirmResetVisited ? (
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => {
                          clearVisitedPlaces();
                          setConfirmResetVisited(false);
                        }}
                        className="text-red-400 font-bold underline cursor-pointer"
                      >
                        Sí, resetear todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmResetVisited(false)}
                        className="text-gray-400 hover:text-white cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmResetVisited(true)}
                      className="text-[11px] font-semibold text-gray-400 hover:text-red-400 transition cursor-pointer"
                    >
                      Resetear visitados
                    </button>
                  )}
                </div>
              )}
            </div>

            {visitedPlaces.length === 0 ? (
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 text-center space-y-1">
                <p className="text-xs font-semibold text-gray-300">
                  No has marcado ningún sitio como visitado aún
                </p>
                <p className="text-[11px] text-gray-500">
                  Usa el botón discreto <span className="text-emerald-400 font-semibold">✓ Ya estuve aquí</span> en cualquier tarjeta para no repetir locales en futuras búsquedas.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1 scrollbar-hide">
                {visitedPlaces.map((vp) => (
                  <div
                    key={`${vp.id}-${vp.name}`}
                    className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                        <span className="text-emerald-400 text-[11px]">✓</span>
                        <span className="truncate">{vp.name}</span>
                      </p>
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">
                        {vp.cityName ? `${vp.cityName} • ` : ''}
                        {vp.address || 'Marcado como visitado'} • {formatShortDate(vp.visitedAt)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeVisitedPlace(vp.id, vp.name)}
                      className="py-1 px-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 text-[11px] font-bold transition flex-shrink-0 cursor-pointer"
                      title="Volver a incluir este sitio en futuras recomendaciones"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleRecommendApp}
              className="py-1.5 px-3 rounded-xl bg-white/[0.05] hover:bg-[#FF5E2B]/15 border border-white/10 hover:border-[#FF5E2B]/40 text-xs font-bold text-gray-200 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
              title="Compartir TasteLocal Living con tus amigos"
            >
              <svg className="w-3.5 h-3.5 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>{shareFeedback || 'Compartir TasteLocal Living'}</span>
            </button>
            <span className="text-[11px] font-mono text-gray-500">v1.0 Production</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 rounded-xl bg-[#FF5E2B] hover:bg-[#E84D1C] text-white text-xs font-bold transition cursor-pointer"
          >
            Guardar y Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreferencesModal;
