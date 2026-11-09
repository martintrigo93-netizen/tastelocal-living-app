import React, { useState } from 'react';
import { type ProposalPlan } from '../types';

interface SharePlanModalProps {
  plan: ProposalPlan;
  moodPhrase?: string;
  isOpen: boolean;
  onClose: () => void;
}

const SharePlanModal: React.FC<SharePlanModalProps> = ({
  plan,
  moodPhrase,
  isOpen,
  onClose,
}) => {
  const [copiedStatus, setCopiedStatus] = useState<'idle' | 'copied' | 'instagram'>('idle');

  if (!isOpen) return null;

  const emotionDisplay = moodPhrase || plan.tagline || 'Planes que sienten contigo';

  const generateShareText = (): string => {
    const stopsText = plan.schedule
      .map((s, idx) => `  ${idx + 1}. ${s.time} - ${s.placeName} (${s.activity})`)
      .join('\n');

    return `✨ TasteLocal Living
«Mi cuerpo pide: ${emotionDisplay}»

📍 ${plan.title} (${plan.badge})
⏱️ Duración: ${plan.approxDuration}

Paradas de la ruta:
${stopsText}

💡 Por qué encaja hoy: "${plan.matchReason}"

Descubre tu experiencia local en: ${window.location.origin}`;
  };

  const handleNativeShare = async () => {
    const shareText = generateShareText();
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `TasteLocal Living: ${plan.title}`,
          text: shareText,
          url: window.location.origin,
        });
        return;
      } catch (err) {
        console.warn('Native share dismissed or failed, fallback to copy:', err);
      }
    }

    handleCopyToClipboard();
  };

  const handleWhatsAppShare = () => {
    const text = generateShareText();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleInstagramShare = async () => {
    const shareText = generateShareText();
    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedStatus('instagram');
      setTimeout(() => setCopiedStatus('idle'), 4000);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      const shareText = generateShareText();
      await navigator.clipboard.writeText(shareText);
      setCopiedStatus('copied');
      setTimeout(() => setCopiedStatus('idle'), 3000);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fade-in text-left select-none"
    >
      <div className="relative w-full max-w-md bg-[#0F1015] border border-white/10 rounded-3xl shadow-[0_12px_50px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden">
        {/* Top Bar */}
        <div className="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between bg-[#0F1015]/95">
          <div className="flex items-center gap-2">
            <span className="text-base text-[#FF5E2B]">📮</span>
            <span id="share-modal-title" className="text-xs uppercase tracking-widest font-black text-white">
              Tarjeta Postal para Compartir
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            title="Cerrar modal"
            aria-label="Cerrar modal"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tarjeta Postal Visual Preview */}
        <div className="p-5 overflow-y-auto max-h-[70vh] scrollbar-hide space-y-3.5">
          <div className="relative p-6 rounded-3xl bg-gradient-to-br from-[#161720] via-[#0F1015] to-[#13141c] border-2 border-[#FF5E2B]/40 shadow-2xl space-y-4 overflow-hidden">
            {/* Stamp watermark */}
            <div className="absolute top-4 right-4 flex flex-col items-center border border-[#FF5E2B]/50 px-2.5 py-1 rounded-lg bg-[#FF5E2B]/10 transform rotate-6 shadow-sm">
              <span className="text-[8px] uppercase tracking-widest font-black text-[#FF5E2B]">TASTELOCAL</span>
              <span className="text-[7px] text-gray-300 font-bold">100% VERIFICADO</span>
            </div>

            {/* Emotional Quote */}
            <div className="space-y-1 pr-16">
              <span className="text-[10px] uppercase tracking-widest font-bold text-[#FF5E2B] block">
                Mi cuerpo pide hoy:
              </span>
              <h3 className="text-lg md:text-xl font-black text-white tracking-tight leading-snug">
                «{emotionDisplay}»
              </h3>
            </div>

            {/* Plan Title & Badge */}
            <div className="pt-2 border-t border-white/10">
              <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#FF5E2B] bg-[#FF5E2B]/15 border border-[#FF5E2B]/30 px-2.5 py-0.5 rounded-md">
                {plan.badge}
              </span>
              <h4 className="text-base font-extrabold text-white mt-1.5 leading-snug">{plan.title}</h4>
              <p className="text-xs text-gray-300 mt-0.5 leading-relaxed">
                {plan.shortDescription}
              </p>
            </div>

            {/* Stops list on postcard */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
                Paradas de la ruta ({plan.approxDuration}):
              </p>
              <div className="space-y-1.5">
                {plan.schedule.map((stop, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs">
                    <span className="w-5 h-5 rounded-full bg-[#FF5E2B] text-white flex items-center justify-center font-black text-[10px] flex-shrink-0 shadow-sm">
                      {idx + 1}
                    </span>
                    <span className="text-white font-semibold truncate">{stop.placeName}</span>
                    <span className="text-gray-400 text-[11px] font-mono">• {stop.time}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Match Reason snippet */}
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10 text-[11px] text-gray-200 italic leading-snug">
              "{plan.matchReason}"
            </div>

            {/* Footer brand */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[10px] text-gray-500">
              <span className="font-semibold text-gray-400">TasteLocal Living</span>
              <span className="text-[#FF5E2B] font-bold">Lugares 100% Reales</span>
            </div>
          </div>

          {/* Toast / Feedback */}
          {copiedStatus === 'copied' && (
            <div className="p-2.5 rounded-xl bg-[#FF5E2B]/15 border border-[#FF5E2B]/40 text-center text-xs font-bold text-[#FF5E2B] animate-fade-in shadow-sm">
              ✓ ¡Texto copiado al portapapeles! Listo para pegar y enviar.
            </div>
          )}

          {copiedStatus === 'instagram' && (
            <div className="p-3 rounded-xl bg-gradient-to-r from-purple-950/60 to-pink-950/40 border border-pink-500/40 text-center text-xs font-bold text-pink-200 animate-fade-in space-y-1 shadow-sm">
              <p>✓ ¡Copiado para Instagram Stories!</p>
              <p className="text-[11px] text-gray-300 font-normal">
                Abre Instagram Stories, crea una historia y pega este resumen en tu sticker de texto.
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons: Native Share, WhatsApp, Instagram Stories & Copy */}
        <div className="p-4 bg-white/[0.02] border-t border-white/[0.08] space-y-2">
          {/* Main Web Share API Button */}
          <button
            type="button"
            onClick={handleNativeShare}
            className="w-full py-3 px-5 rounded-2xl font-black text-xs uppercase tracking-wider bg-[#FF5E2B] hover:bg-[#E84D1C] text-white shadow-[0_4px_18px_rgba(255,94,43,0.35)] transition transform hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span>Compartir con Web Share API</span>
          </button>

          {/* Social Row: WhatsApp & Instagram Stories */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleWhatsAppShare}
              className="py-2.5 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 transition text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              title="Compartir por WhatsApp"
            >
              <span className="text-base">💬</span>
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleInstagramShare}
              className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-500/15 to-pink-500/15 hover:from-purple-500/25 hover:to-pink-500/25 border border-pink-500/30 text-pink-300 transition text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              title="Copiar postal para Instagram Stories"
            >
              <span className="text-base">📸</span>
              <span>Instagram Stories</span>
            </button>
          </div>

          {/* Copy Plain Text */}
          <button
            type="button"
            onClick={handleCopyToClipboard}
            className="w-full py-2 px-4 rounded-xl text-[11px] font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition border border-white/10 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            <span>Copiar texto formateado</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SharePlanModal;
