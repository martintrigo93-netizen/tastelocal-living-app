import React, { useState, useEffect, lazy, Suspense } from 'react';
import HomePage from './components/HomePage';
import WelcomePage from './components/WelcomePage';
import ConfigurationErrorPage from './components/ConfigurationErrorPage';
import ErrorBoundary from './components/ErrorBoundary';
import { AppProvider, useAppContext } from './context/AppContext';
import { areApiKeysConfigured } from './config';

const ItineraryPage = lazy(() => import('./components/ItineraryPage'));
const PreferencesModal = lazy(() => import('./components/PreferencesModal'));
const GroupMatchView = lazy(() => import('./components/GroupMatchView'));

const ViewLoadingFallback: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full bg-[#0F1015] text-white p-6">
    <div className="w-8 h-8 rounded-full border-2 border-[#FF5E2B]/30 border-t-[#FF5E2B] animate-spin mb-3" />
    <span className="text-xs text-gray-400 font-medium">Cargando vista...</span>
  </div>
);

/**
 * Enrutador principal según el marco "FEEL ➔ DISCOVER ➔ EXPERIENCE":
 * 1. Bienvenida Sensorial (Definición de contexto y ubicación de partida)
 * 2. HomePage (FEEL: Selector emocional en lenguaje natural, energía y entorno)
 * 3. ItineraryPage (DISCOVER & EXPERIENCE: 3 Propuestas curadas, mapa interactivo y ficha editorial)
 */
const AppContent: React.FC = () => {
  const {
    page,
    userLocation,
    isPreferencesModalOpen,
    setIsPreferencesModalOpen,
  } = useAppContext();

  if (!areApiKeysConfigured()) {
    return <ConfigurationErrorPage />;
  }

  const renderPage = () => {
    if (page === 'group') {
      return <GroupMatchView />;
    }

    // Si el usuario está en bienvenida o aún no ha seleccionado su ubicación de partida
    if (page === 'welcome' || !userLocation) {
      return <WelcomePage />;
    }

    switch (page) {
      case 'home':
        return <HomePage />;
      case 'itinerary':
        return <ItineraryPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <>
      <Suspense fallback={<ViewLoadingFallback />}>{renderPage()}</Suspense>
      {isPreferencesModalOpen && (
        <Suspense fallback={null}>
          <PreferencesModal
            isOpen={isPreferencesModalOpen}
            onClose={() => setIsPreferencesModalOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
};

const App: React.FC = () => {
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(false);

  useEffect(() => {
    const handleQuotaExceeded = () => {
      setQuotaExceeded(true);
    };

    window.addEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    return () => {
      window.removeEventListener('gmp-quota-exceeded', handleQuotaExceeded);
    };
  }, []);

  return (
    <AppProvider>
      <div className="w-full h-full min-h-[100dvh] max-h-[100dvh] bg-[#0B0C0E] font-sans flex flex-col items-center justify-center sm:p-3 md:p-4 text-white overflow-hidden">
        {quotaExceeded && (
          <div className="w-full max-w-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 px-4 py-2 text-xs text-center sticky top-0 z-50 shadow-sm rounded-t-xl backdrop-blur-md">
            <span>
              Límite de cuota alcanzado en Google Maps Platform. Consulta la consola de Google Cloud para ampliar la cuota de la aplicación.
            </span>
          </div>
        )}

        <main className="w-full h-full md:max-w-4xl lg:max-w-5xl xl:max-w-6xl md:h-[94vh] md:max-h-[960px] bg-[#0F1015] md:border md:border-white/10 flex flex-col shadow-2xl md:rounded-3xl overflow-hidden relative">
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </main>
      </div>
    </AppProvider>
  );
};

export default App;
