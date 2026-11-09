import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { geocodeAddressProxy } from '../services/apiProxy';

const WelcomePage: React.FC = () => {
  const { setUserLocation } = useAppContext();
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [view, setView] = useState<'initial' | 'search'>('initial');
  const [searchQuery, setSearchQuery] = useState('');

  const handleGetLocation = () => {
    setStatus('loading');
    setErrorMessage('');
    setView('initial');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
      },
      (error) => {
        console.error("Error getting location:", error);
        let specificError = "No hemos podido acceder a tu ubicación. ¿Quieres buscar un lugar manualmente?";
        if (error.code === error.PERMISSION_DENIED) {
            specificError = "Has denegado el permiso de ubicación. No te preocupes, puedes buscar un lugar manualmente.";
        } else if (error.code === error.TIMEOUT) {
            specificError = "La búsqueda de ubicación ha tardado demasiado. Inténtalo buscando manualmente.";
        }
        setErrorMessage(specificError);
        setStatus('error');
        setView('search'); // ¡Mejora clave! Cambia a la búsqueda manual automáticamente
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };
  
  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim() !== '') {
        setStatus('loading');
        setErrorMessage('');
        try {
            const location = await geocodeAddressProxy(searchQuery);
            if (location) {
                setUserLocation(location);
            } else {
                setErrorMessage("No se pudo encontrar esa ubicación. Inténtalo de nuevo con más detalles.");
                setStatus('error');
            }
        } catch (error)
        {
            console.error("Error searching for location with proxy:", error);
            setErrorMessage("Ocurrió un error al buscar. Comprueba tu clave de API y la conexión.");
            setStatus('error');
        }
    }
  };

  const renderContent = () => {
    if (status === 'loading' && view === 'initial') {
      return (
         <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-white"></div>
            <p className="text-white font-semibold mt-4">Buscando ubicación...</p>
        </div>
      );
    }

    return (
      <div className="z-10 flex flex-col items-center justify-center h-full p-8 text-center text-white">
        <header className="mb-auto mt-16">
          <h1 className="text-5xl font-bold text-white" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
            TasteLocal Living
          </h1>
        </header>
        <main className="flex-grow flex flex-col justify-center items-center w-full">
            {/* Spacer */}
        </main>
        <footer className="w-full">
          {view === 'initial' && (
            <div className="animate-fade-in">
              <button
                onClick={handleGetLocation}
                className="w-full py-4 px-6 mb-4 text-white font-bold rounded-lg shadow-lg transition-all transform hover:scale-105 bg-blue-600 hover:bg-blue-700"
              >
                Usar mi ubicación
              </button>
              <button
                onClick={() => setView('search')}
                className="w-full py-3 px-6 text-gray-800 font-semibold rounded-lg shadow-md bg-white hover:bg-gray-100 transition-colors"
              >
                Buscar otro lugar
              </button>
            </div>
          )}

          {view === 'search' && (
             <form onSubmit={handleManualSearch} className="w-full animate-fade-in">
                <label htmlFor="manual-location-search" className="sr-only">
                    Buscar ubicación manualmente
                </label>
                <input
                    type="text"
                    id="manual-location-search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Introduce una ciudad o dirección..."
                    className="w-full p-4 text-gray-800 rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button 
                    type="submit" 
                    disabled={status === 'loading'}
                    className="w-full py-3 mt-4 px-6 text-white font-bold rounded-lg shadow-lg transition-all transform hover:scale-105 bg-green-600 hover:bg-green-700 disabled:bg-gray-500 flex justify-center items-center"
                >
                    {status === 'loading' ? <div className="w-6 h-6 border-2 border-dashed rounded-full animate-spin border-white"></div> : 'Buscar'}
                </button>
                <button type="button" onClick={() => { setView('initial'); setStatus('idle'); setErrorMessage(''); }} className="text-sm text-gray-200 mt-4 hover:underline">
                    Cancelar
                </button>
             </form>
          )}

           {status === 'error' && errorMessage && (
             <p className="text-sm text-red-300 bg-black/30 p-2 rounded-md mt-4 font-semibold animate-fade-in">
                {errorMessage}
             </p>
           )}
           {status === 'idle' && view === 'initial' && (
            <p className="text-sm text-gray-200 mt-4">
                Necesitamos tu ubicación para sugerirte planes cercanos
            </p>
           )}
        </footer>
      </div>
    );
  };

  return (
    <div className="relative flex flex-col h-full text-center bg-gray-800 overflow-y-auto animate-fade-in">
        <div 
            className="absolute inset-0 w-full h-full bg-cover bg-center"
            style={{ backgroundImage: "url('https://images.unsplash.com/photo-1500964757637-c85e8a162699?q=80&w=2103&auto=format&fit=crop')" }}
        >
             <div className="absolute inset-0 w-full h-full bg-black opacity-40"></div>
        </div>
        {renderContent()}
    </div>
  );
};

export default WelcomePage;