import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'hero' | 'minimal';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'header',
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed, hide prompt
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    if (variant === 'hero') {
      return (
        <button
          type="button"
          onClick={install}
          className={`py-3 px-5 rounded-2xl bg-gradient-to-r from-[#FF5E2B] to-[#FF7A4D] hover:from-[#E84D1C] hover:to-[#FF5E2B] text-white text-xs font-black uppercase tracking-wider shadow-[0_4px_20px_rgba(255,94,43,0.35)] transition transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer ${className}`}
        >
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span>Instalar App en tu Móvil</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={install}
        className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-[#FF5E2B]/15 hover:bg-[#FF5E2B] border border-[#FF5E2B]/40 text-[#FF5E2B] hover:text-white transition duration-200 text-xs font-bold cursor-pointer shadow-sm ${className}`}
        title="Instalar TasteLocal Living como aplicación"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        <span className="hidden sm:inline">Instalar App</span>
        <span className="sm:hidden">App</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not fired by iOS WebKit)
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition text-xs font-bold cursor-pointer ${className}`}
          title="Instalar TasteLocal en iPhone/iPad"
        >
          <span>📲</span>
          <span className="hidden sm:inline">Instalar en iOS</span>
          <span className="sm:hidden">iOS</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in text-left select-none"
          >
            <div className="w-full max-w-sm rounded-3xl bg-[#0F1015] border border-white/15 p-6 shadow-2xl text-white space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📲</span>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Instalar en iPhone / iPad
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="w-7 h-7 rounded-xl bg-white/5 text-gray-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs text-gray-300">
                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
                  <span className="w-6 h-6 rounded-lg bg-[#FF5E2B]/20 text-[#FF5E2B] font-black flex items-center justify-center flex-shrink-0 text-xs">
                    1
                  </span>
                  <p>
                    Pulsa el botón <strong>Compartir</strong> (icono de cuadrado con flecha hacia arriba) en la barra de Safari.
                  </p>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
                  <span className="w-6 h-6 rounded-lg bg-[#FF5E2B]/20 text-[#FF5E2B] font-black flex items-center justify-center flex-shrink-0 text-xs">
                    2
                  </span>
                  <p>
                    Baja en las opciones y selecciona <strong>«Añadir a pantalla de inicio»</strong>.
                  </p>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
                  <span className="w-6 h-6 rounded-lg bg-[#FF5E2B]/20 text-[#FF5E2B] font-black flex items-center justify-center flex-shrink-0 text-xs">
                    3
                  </span>
                  <p>
                    Pulsa <strong>Añadir</strong>. ¡TasteLocal Living se abrirá como una App nativa a pantalla completa!
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-[#FF5E2B] hover:bg-[#E84D1C] text-white text-xs font-bold transition shadow-sm cursor-pointer text-center"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export default PWAInstallButton;
