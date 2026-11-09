import React from 'react';
import HomePage from './components/HomePage';
import ItineraryPage from './components/ItineraryPage';
import WelcomePage from './components/WelcomePage';
import ConfigurationErrorPage from './components/ConfigurationErrorPage';
import ErrorBoundary from './components/ErrorBoundary';
import { AppProvider, useAppContext } from './context/AppContext';
import { areApiKeysConfigured } from './config';

const AppContent: React.FC = () => {
  const { page, userLocation } = useAppContext();

  if (!areApiKeysConfigured()) {
    return <ConfigurationErrorPage />;
  }

  if (!userLocation) {
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

const App: React.FC = () => {
  return (
    <AppProvider>
      <div className="w-screen h-screen bg-gray-100 font-sans flex items-center justify-center">
        {/* El contenedor ahora es semántico (<main>) y más grande en desktop */}
        <main className="w-full h-full md:max-w-lg md:h-[95vh] md:max-h-[900px] bg-white flex flex-col shadow-2xl md:rounded-2xl">
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </main>
      </div>
    </AppProvider>
  );
};

export default App;