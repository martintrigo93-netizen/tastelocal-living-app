import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { geocodeAddressProxy } from '../services/apiProxy';
import SavedPlansModal from './SavedPlansModal';

const POPULAR_CITIES = [
  { name: 'Madrid', lat: 40.4168, lng: -3.7038 },
  { name: 'Barcelona', lat: 41.3879, lng: 2.1699 },
  { name: 'Valencia', lat: 39.4699, lng: -0.3763 },
  { name: 'Sevilla', lat: 37.3891, lng: -5.9845 },
  { name: 'Bilbao', lat: 43.263, lng: -2.935 },
];

const WelcomePage: React.FC = () => {
  const {
    setUserLocation,
    savedPlans,
    isSavedPlansModalOpen,
    setIsSavedPlansModalOpen,
    handleSurpriseMe,
  } = useAppContext();
  const [selectedCityName, setSelectedCityName] = useState<string>('Madrid');
  const [customQuery, setCustomQuery] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'locating' | 'geocoding' | 'error'>('idle');
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');
  const [detectedCoords, setDetectedCoords] = useState<{ lat: number; lng: number } | null>({
    lat: 40.4168,
    lng: -3.7038,
  });

  // Botón directo "⚡ Sorpréndeme Ahora (1 Tap)"
  const handleOneTapSurprise = async () => {
    setStatus('locating');
    setFeedbackMessage('Sintonizando tu ubicación y el clima para una propuesta 1-Tap...');

    // 1. Si el usuario escribió un municipio en el buscador
    if (customQuery.trim()) {
      try {
        const loc = await geocodeAddressProxy(customQuery.trim());
        if (loc) {
          setUserLocation(loc);
          await handleSurpriseMe(loc);
          return;
        }
      } catch (e) {
        console.warn('Geocoding query fallback in surprise me:', e);
      }
    }

    // 2. Si ya hay coordenadas detectadas o ciudad seleccionada
    if (detectedCoords) {
      setUserLocation(detectedCoords);
      await handleSurpriseMe(detectedCoords);
      return;
    }

    // 3. Detectar GPS en tiempo real o fallback
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setDetectedCoords(coords);
          setUserLocation(coords);
          await handleSurpriseMe(coords);
        },
        async () => {
          const fallback = { lat: 40.4168, lng: -3.7038 };
          setUserLocation(fallback);
          await handleSurpriseMe(fallback);
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 60000 }
      );
      return;
    }

    const fallback = { lat: 40.4168, lng: -3.7038 };
    setUserLocation(fallback);
    await handleSurpriseMe(fallback);
  };

  // Detectar ubicación actual vía Geolocation API
  const handleDetectLocation = () => {
    setStatus('locating');
    setFeedbackMessage('');

    if (!navigator.geolocation) {
      setFeedbackMessage('Tu dispositivo no soporta geolocalización directa. Puedes buscar tu municipio escribiéndolo abajo.');
      setStatus('error');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setDetectedCoords(coords);
        setSelectedCityName('Mi ubicación actual');
        setCustomQuery('');
        setStatus('idle');
        setFeedbackMessage('Ubicación detectada con precisión');
        setTimeout(() => setFeedbackMessage(''), 3500);
      },
      (error) => {
        console.warn('Geolocation notice:', error?.message || `code ${error?.code}`);
        let msg = 'No pudimos acceder a tu ubicación precisa. Escribe tu municipio o pulsa una ciudad.';
        if (error.code === error.PERMISSION_DENIED) {
          msg = 'Permiso de ubicación desactivado. Puedes escribir cualquier municipio abajo.';
        }
        setFeedbackMessage(msg);
        setStatus('error');
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  // Seleccionar ciudad rápida
  const handleSelectCityChip = (city: typeof POPULAR_CITIES[number]) => {
    setSelectedCityName(city.name);
    setCustomQuery('');
    setDetectedCoords({ lat: city.lat, lng: city.lng });
    setFeedbackMessage('');
  };

  // Acción principal al pulsar "Descubrir mi experiencia"
  const handleDiscoverExperience = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const query = customQuery.trim();

    // 1. Si el usuario escribió un municipio nuevo
    if (query) {
      setStatus('geocoding');
      setFeedbackMessage('');
      try {
        const location = await geocodeAddressProxy(query);
        if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
          setUserLocation(location);
          return;
        }
      } catch (err) {
        console.warn('Geocoding query notice:', err);
      }

      // Fallback a matching con ciudades conocidas
      const matched = POPULAR_CITIES.find(
        (c) => c.name.toLowerCase() === query.toLowerCase()
      );
      if (matched) {
        setUserLocation({ lat: matched.lat, lng: matched.lng });
        return;
      }

      // Si no se encuentra, usar Madrid como centro seguro
      setFeedbackMessage(`No encontramos "${query}". Te conectamos con experiencias en Madrid.`);
      setStatus('error');
      setTimeout(() => {
        setUserLocation({ lat: 40.4168, lng: -3.7038 });
      }, 1200);
      return;
    }

    // 2. Si ya hay una ubicación detectada o seleccionada
    if (detectedCoords) {
      setUserLocation(detectedCoords);
      return;
    }

    // 3. Fallback predeterminado a Madrid
    setUserLocation({ lat: 40.4168, lng: -3.7038 });
  };

  return (
    <div className="relative flex flex-col h-full bg-[#0F1015] text-white overflow-hidden select-none">
      {/* Atmósfera visual de fondo con halo Naranja Coral */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-36 -right-36 w-96 h-96 rounded-full bg-[#FF5E2B]/15 blur-3xl animate-subtle-pulse"></div>
        <div className="absolute -bottom-36 -left-36 w-96 h-96 rounded-full bg-[#FF5E2B]/10 blur-3xl"></div>
        <div className="absolute inset-0 bg-radial from-transparent via-[#0F1015]/60 to-[#0F1015]"></div>
      </div>

      <div className="relative z-10 flex flex-col justify-between h-full p-6 sm:p-8 md:p-10">
        {/* Cabecera Editorial */}
        <header className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5E2B] shadow-[0_0_12px_#FF5E2B]"></span>
            <span className="text-[11px] uppercase tracking-[0.22em] font-bold text-white">
              TasteLocal Living
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* ❤️ Mis Planes Header Button */}
            <button
              type="button"
              onClick={() => setIsSavedPlansModalOpen(true)}
              className="flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-white/[0.05] hover:bg-[#FF5E2B]/15 border border-white/10 hover:border-[#FF5E2B]/40 text-xs font-bold text-gray-300 hover:text-white transition cursor-pointer"
              title="Ver mis planes guardados"
            >
              <span className="text-red-400">❤️</span>
              <span className="hidden sm:inline">Mis Planes</span>
              {savedPlans.length > 0 && (
                <span className="bg-[#FF5E2B] text-white text-[10px] font-black px-1.5 py-0.2 rounded-full min-w-[18px] text-center">
                  {savedPlans.length}
                </span>
              )}
            </button>

            <span className="text-[10px] uppercase tracking-[0.16em] text-gray-400 border border-white/10 px-2.5 py-1 rounded-full backdrop-blur-sm hidden sm:inline-block">
              Curaduría Factual
            </span>
          </div>
        </header>

        {/* Hero Emocional Central */}
        <main className="my-auto py-4 space-y-6 text-left max-w-2xl mx-auto w-full">
          {/* Encabezado Emocional Requerido */}
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2">
              <span className="text-xs uppercase tracking-[0.2em] font-bold text-[#FF5E2B] bg-[#FF5E2B]/10 border border-[#FF5E2B]/20 px-3 py-1 rounded-full">
                Planes que sienten contigo
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white leading-[1.12]">
              ¿Qué te pide el cuerpo hoy?
            </h1>

            <p className="text-xs sm:text-sm text-gray-400 font-normal leading-relaxed max-w-lg">
              Transformamos tu energía, estado de ánimo y compañía en propuestas de experiencias locales verificadas, con el pulso real de la ciudad.
            </p>
          </div>

          {/* Bloque de Ubicación y Búsqueda */}
          <div className="space-y-3.5 bg-white/[0.03] p-4 sm:p-5 rounded-2xl border border-white/10 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <label htmlFor="manual-city-input" className="text-xs uppercase tracking-wider text-gray-300 font-semibold flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-[#FF5E2B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Tu municipio o ciudad</span>
              </label>

              {/* Botón Detectar Ubicación Actual */}
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={status === 'locating'}
                className="text-[11px] text-[#FF5E2B] hover:text-white font-medium hover:underline flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
              >
                {status === 'locating' ? (
                  <>
                    <div className="w-2.5 h-2.5 border-2 border-[#FF5E2B] border-t-transparent rounded-full animate-spin"></div>
                    <span>Detectando...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Detectar GPS</span>
                  </>
                )}
              </button>
            </div>

            {/* Input de Búsqueda Manual Limpio */}
            <form onSubmit={handleDiscoverExperience} className="relative">
              <input
                type="text"
                id="manual-city-input"
                value={customQuery || (selectedCityName !== 'Madrid' ? selectedCityName : '')}
                onChange={(e) => {
                  setCustomQuery(e.target.value);
                  setSelectedCityName(e.target.value);
                }}
                placeholder="Escribe municipio (ej. Madrid, Barcelona, Valencia, Donostia...)"
                className="w-full py-3 pl-10 pr-4 bg-white/5 border border-white/15 focus:border-[#FF5E2B] rounded-xl text-xs sm:text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#FF5E2B] transition"
              />
              <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </form>

            {/* Chips de Ciudades Populares */}
            <div className="pt-1">
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_CITIES.map((city) => {
                  const isCurrent = selectedCityName.toLowerCase() === city.name.toLowerCase() && !customQuery;
                  return (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => handleSelectCityChip(city)}
                      className={`py-1 px-2.5 rounded-full text-[11px] font-medium transition cursor-pointer border ${
                        isCurrent
                          ? 'bg-[#FF5E2B]/20 text-white border-[#FF5E2B]/60 shadow-[0_0_10px_rgba(255,94,43,0.2)]'
                          : 'bg-white/[0.05] hover:bg-white/[0.1] text-gray-400 hover:text-white border-white/10'
                      }`}
                    >
                      {city.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Feedback & Mensajes */}
            {feedbackMessage && (
              <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 animate-fade-in ${
                status === 'error'
                  ? 'bg-red-950/40 border border-red-500/30 text-red-200'
                  : 'bg-[#FF5E2B]/10 border border-[#FF5E2B]/30 text-[#FF5E2B]'
              }`}>
                <span className="leading-snug">{feedbackMessage}</span>
              </div>
            )}
          </div>

          {/* CTAs: Principal + Acceso Directo 1-Tap */}
          <div className="pt-1 space-y-2.5">
            <button
              type="button"
              onClick={() => handleDiscoverExperience()}
              disabled={status === 'geocoding' || status === 'locating'}
              className="w-full py-4 px-6 rounded-2xl font-black text-sm tracking-wide bg-[#FF5E2B] hover:bg-[#E84D1C] disabled:bg-white/10 text-white disabled:text-gray-500 shadow-[0_8px_24px_rgba(255,94,43,0.35)] transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-2.5 cursor-pointer disabled:cursor-not-allowed"
            >
              {status === 'geocoding' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></div>
                  <span>Localizando municipio...</span>
                </>
              ) : (
                <>
                  <span>Descubrir mi experiencia</span>
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </>
              )}
            </button>

            {/* TASTELOCAL SURPRISE: Botón Destacado "⚡ Sorpréndeme Ahora (1 Tap)" */}
            <div className="relative pt-1">
              <button
                type="button"
                onClick={handleOneTapSurprise}
                disabled={status === 'geocoding' || status === 'locating'}
                className="w-full py-4 px-6 rounded-2xl font-black text-sm tracking-wide bg-gradient-to-r from-[#FF5E2B]/20 via-[#FF5E2B]/10 to-[#FF5E2B]/20 hover:from-[#FF5E2B]/30 hover:to-[#FF5E2B]/30 text-white border-2 border-[#FF5E2B] shadow-[0_0_30px_rgba(255,94,43,0.35)] hover:shadow-[0_0_45px_rgba(255,94,43,0.55)] transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group backdrop-blur-md"
              >
                <span className="text-xl text-[#FF5E2B] group-hover:scale-125 transition-transform duration-300 drop-shadow-[0_0_10px_#FF5E2B]">
                  ⚡
                </span>
                <span className="text-white group-hover:text-[#FF5E2B] transition-colors">
                  Sorpréndeme Ahora (1 Tap)
                </span>
                <span className="text-[10px] uppercase font-extrabold text-[#FF5E2B] bg-[#FF5E2B]/20 border border-[#FF5E2B]/40 px-2.5 py-0.5 rounded-full ml-1 hidden sm:inline shadow-sm">
                  1-Tap Instantáneo
                </span>
              </button>
              <p className="text-[10px] text-gray-400 text-center mt-1.5">
                Salta directamente a tu plan hiper-personalizado sintonizado con la hora local y el clima, sin filtros.
              </p>
            </div>
          </div>
        </main>

        {/* Pie de página Editorial */}
        <footer className="pt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-gray-500">
          <span>Lugares 100% verificados</span>
          <span className="text-[#FF5E2B]/90 font-medium">TasteLocal Living</span>
        </footer>
      </div>

      {/* Saved Plans Modal */}
      <SavedPlansModal
        isOpen={isSavedPlansModalOpen}
        onClose={() => setIsSavedPlansModalOpen(false)}
      />
    </div>
  );
};

export default WelcomePage;
