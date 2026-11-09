import React, { useState, useEffect, useRef } from 'react';

interface AudioNarratorProps {
  title: string;
  tagline?: string;
  matchReason: string;
  experienceNarrative?: string;
  className?: string;
}

export const AudioNarrator: React.FC<AudioNarratorProps> = ({
  title,
  tagline,
  matchReason,
  experienceNarrative,
  className = '',
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setIsSupported(false);
      return;
    }

    // Cancel any ongoing speech on mount/unmount or content change
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [title, matchReason]);

  if (!isSupported) {
    return null;
  }

  const prepareText = () => {
    const parts = [
      title,
      tagline ? `${tagline}.` : '',
      `Por qué encaja contigo hoy: ${matchReason}.`,
      experienceNarrative ? `${experienceNarrative}` : '',
    ];
    return parts.filter(Boolean).join(' ');
  };

  const handlePlay = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPaused(false);
      setIsPlaying(true);
      return;
    }

    window.speechSynthesis.cancel();

    const textToRead = prepareText();
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES';
    utterance.rate = 0.94; // Cadencia pausada y narrativa
    utterance.pitch = 1.0;

    // Buscar voz nativa en español
    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(
      (v) => v.lang.startsWith('es') || v.lang.includes('Spanish')
    );
    if (spanishVoice) {
      utterance.voice = spanishVoice;
    }

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
    };

    utterance.onpause = () => {
      setIsPaused(true);
      setIsPlaying(false);
    };

    utterance.onresume = () => {
      setIsPaused(false);
      setIsPlaying(true);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utterance.onerror = (e) => {
      console.warn('SpeechSynthesis error:', e);
      setIsPlaying(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const handlePause = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.pause();
    setIsPaused(true);
    setIsPlaying(false);
  };

  const handleStop = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {isPlaying ? (
        <div className="flex items-center gap-1.5 bg-[#FF5E2B]/15 border border-[#FF5E2B]/40 px-3 py-1.5 rounded-xl shadow-[0_0_15px_rgba(255,94,43,0.3)] animate-fade-in">
          {/* Animated Waveform Equalizer */}
          <div className="flex items-center gap-0.5 h-3.5 pr-1">
            <span className="w-1 bg-[#FF5E2B] rounded-full h-full animate-pulse"></span>
            <span className="w-1 bg-[#FF5E2B] rounded-full h-2 animate-bounce"></span>
            <span className="w-1 bg-[#FF5E2B] rounded-full h-full animate-pulse delay-75"></span>
            <span className="w-1 bg-[#FF5E2B] rounded-full h-1.5 animate-bounce delay-150"></span>
          </div>

          <span className="text-[11px] font-bold text-white tracking-wide">Narrando plan...</span>

          {/* Pause Button */}
          <button
            type="button"
            onClick={handlePause}
            className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition ml-1 cursor-pointer"
            title="Pausar audio"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          </button>

          {/* Stop Button */}
          <button
            type="button"
            onClick={handleStop}
            className="p-1 rounded-lg bg-white/10 hover:bg-red-500/30 text-white transition cursor-pointer"
            title="Detener audio"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h12v12H6z" />
            </svg>
          </button>
        </div>
      ) : isPaused ? (
        <div className="flex items-center gap-1.5 bg-white/5 border border-white/15 px-3 py-1.5 rounded-xl">
          <span className="text-[11px] font-bold text-gray-300">Audio en pausa</span>
          <button
            type="button"
            onClick={handlePlay}
            className="p-1 rounded-lg bg-[#FF5E2B] text-white hover:bg-[#E84D1C] transition cursor-pointer"
            title="Reanudar"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleStop}
            className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-gray-400 hover:text-white transition cursor-pointer"
            title="Detener"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h12v12H6z" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handlePlay}
          className="group flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-white/[0.04] hover:bg-[#FF5E2B]/15 border border-white/10 hover:border-[#FF5E2B]/40 text-gray-300 hover:text-white transition-all duration-200 text-xs font-bold cursor-pointer"
          title="Escuchar narración de por qué encaja este plan contigo hoy"
        >
          <span className="text-base group-hover:scale-110 transition-transform">🎧</span>
          <span>Escuchar mi plan</span>
          <svg className="w-3 h-3 text-[#FF5E2B] ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default AudioNarrator;
