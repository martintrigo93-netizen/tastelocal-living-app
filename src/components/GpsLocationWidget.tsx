import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  requestCurrentLocation,
  saveLastLocation,
  type GeolocationStatus,
} from '../services/geolocationService';
import { geocodeAddressProxy } from '../services/apiProxy';
import { UserLocation } from '../types';

const POPULAR_QUICK_CITIES = [
  { name: 'Vigo', lat: 42.2406, lng: -8.7207 },
  { name: 'Madrid', lat: 40.4168, lng: -3.7038 },
  { name: 'Barcelona', lat: 41.3879, lng: 2.1699 },
  { name: 'Sevilla', lat: 37.3891, lng: -5.9845 },
  { name: 'Bilbao', lat: 43.263, lng: -2.935 },
  { name: 'Valencia', lat: 39.4699, lng: -0.3763 },
];

interface GpsLocationWidgetProps {
  compact?: boolean;
}

export const GpsLocationWidget: React.FC<GpsLocationWidgetProps> = ({ compact = false }) => {
  const { userLocation, setUserLocation } = useAppContext();
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isManualInputOpen, setIsManualInputOpen] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [isSearchingManual, setIsSearchingManual] = useState(false);

  // Acción: Solicitar geolocalización GPS nativa
  const handleRequestGps = async () => {
    setStatus('locating');
    setErrorMessage('');
    setProgressMsg('Conectando con el sensor GPS...');

    const result = await requestCurrentLocation((msg) => {
      setProgressMsg(msg);
    });

    setStatus(result.status);
    if (result.status === 'granted' && result.location) {
      setUserLocation(result.location);
      setIsManualInputOpen(false);
      setProgressMsg('');
    } else if (result.status === 'denied') {
      setErrorMessage(
        result.errorMessage ||
          'Permiso de ubicación no concedido. Puedes escribir tu municipio a continuación para continuar sin interrupciones.'
      );
      setIsManualInputOpen(true);
    } else {
      setErrorMessage(
        result.errorMessage ||
          'No se pudo obtener la posición GPS precisa. Por favor, introduce tu localidad manualmente.'
      );
      setIsManualInputOpen(true);
    }
  };

  // Acción: Guardar municipio manual como fallback suave
  const handleManualSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = manualQuery.trim();
    if (!query) return;

    setIsSearchingManual(true);
    setErrorMessage('');

    try {
      const loc = await geocodeAddressProxy(query);
      if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
        const fullLoc: UserLocation = {
          lat: loc.lat,
          lng: loc.lng,
          cityName: loc.cityName || query,
          formattedAddress: loc.formattedAddress || query,
          isGps: false,
        };
        saveLastLocation(fullLoc);
        setUserLocation(fullLoc);
        setIsManualInputOpen(false);
        setManualQuery('');
        setStatus('idle');
        return;
      }
    } catch (err) {
      console.warn('Manual geocode notice:', err);
    } finally {
      setIsSearchingManual(false);
    }

    // Matching con ciudades populares
    const matched = POPULAR_QUICK_CITIES.find(
      (c) => c.name.toLowerCase() === query.toLowerCase()
    );
    if (matched) {
      const fullLoc: UserLocation = {
        lat: matched.lat,
        lng: matched.lng,
        cityName: matched.name,
        formattedAddress: matched.name,
        isGps: false,
      };
      saveLastLocation(fullLoc);
      setUserLocation(fullLoc);
      setIsManualInputOpen(false);
      setManualQuery('');
      setStatus('idle');
      return;
    }

    setErrorMessage(`No pudimos geolocalizar "${query}". Revisa el nombre o elige una de las opciones sugeridas.`);
  };

  const handleSelectQuickCity = (city: typeof POPULAR_QUICK_CITIES[number]) => {
    const loc: UserLocation = {
      lat: city.lat,
      lng: city.lng,
      cityName: city.name,
      formattedAddress: city.name,
      isGps: false,
    };
    saveLastLocation(loc);
    setUserLocation(loc);
    setIsManualInputOpen(false);
    setErrorMessage('');
    setStatus('idle');
  };

  const isGpsActive = Boolean(userLocation?.isGps);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {userLocation && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-xs text-white">
            <span
              className={`w-2 h-2 rounded-full ${
                isGpsActive ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse' : 'bg-[#FF5E2B]'
              }`}
            ></span>
            <span className="font-bold truncate max-w-[130px] sm:max-w-[200px]">
              {userLocation.cityName || userLocation.formattedAddress || 'Ubicación'}
            </span>
            {userLocation.neighborhood && (
              <span className="text-[10px] text-gray-400 hidden md:inline truncate max-w-[100px]">
                • {userLocation.neighborhood}
              </span>
            )}
            <span className="text-[10px] text-[#FF5E2B] font-mono font-semibold hidden sm:inline">
              {isGpsActive ? 'GPS ≤ 5km' : '≤ 5km'}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={handleRequestGps}
          disabled={status === 'locating'}
          className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            isGpsActive
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
              : 'bg-[#FF5E2B]/15 text-[#FF5E2B] border border-[#FF5E2B]/30 hover:bg-[#FF5E2B]/25 hover:text-white'
          }`}
          title={isGpsActive ? 'Actualizar coordenadas GPS' : 'Sintonizar ubicación GPS en tiempo real'}
        >
          {status === 'locating' ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
              </svg>
              <span>GPS...</span>
            </>
          ) : (
            <>
              <span>🛰️</span>
              <span>{isGpsActive ? 'Actualizar' : 'Mi GPS'}</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setIsManualInputOpen(!isManualInputOpen)}
          className="text-gray-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 px-2.5 py-1.5 rounded-full text-xs transition cursor-pointer"
          title="Cambiar municipio manualmente"
        >
          ✏️
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {/* Tarjeta Principal de Geolocalización GPS */}
      <div
        className={`p-4 sm:p-4.5 rounded-2xl border transition-all duration-300 relative overflow-hidden ${
          isGpsActive
            ? 'bg-gradient-to-r from-emerald-950/20 via-white/[0.03] to-[#0F1015] border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
            : status === 'denied'
            ? 'bg-gradient-to-r from-amber-950/20 via-white/[0.02] to-[#0F1015] border-amber-500/30'
            : 'bg-gradient-to-r from-[#FF5E2B]/10 via-white/[0.03] to-[#0F1015] border-white/10 hover:border-white/20'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          {/* Lado izquierdo: Estado y Datos de Ubicación */}
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-transform ${
                status === 'locating'
                  ? 'bg-[#FF5E2B]/20 text-[#FF5E2B] animate-pulse'
                  : isGpsActive
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                  : status === 'denied'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-white/[0.06] text-gray-300 border border-white/10'
              }`}
            >
              {status === 'locating' ? '📡' : isGpsActive ? '🛰️' : status === 'denied' ? '⚠️' : '📍'}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#FF5E2B]">
                  {status === 'locating'
                    ? 'Sintonizando sensor'
                    : isGpsActive
                    ? 'GPS en Tiempo Real Activo'
                    : status === 'denied'
                    ? 'Permiso Denegado'
                    : 'Ubicación Configurada'}
                </span>

                {isGpsActive && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    <span>En vivo</span>
                  </span>
                )}
              </div>

              {/* Nombre de la localidad y barrio */}
              <div className="mt-0.5 flex flex-wrap items-baseline gap-1.5">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                  {status === 'locating'
                    ? 'Buscando coordenadas exactas...'
                    : userLocation?.cityName || 'Elige tu ubicación'}
                </h3>
                {userLocation?.neighborhood && (
                  <span className="text-xs font-semibold text-gray-300 bg-white/[0.06] px-2 py-0.5 rounded-md border border-white/10">
                    {userLocation.neighborhood}
                  </span>
                )}
              </div>

              {/* Dirección o precisión */}
              <p className="text-xs text-gray-400 mt-0.5 leading-snug">
                {status === 'locating' ? (
                  <span className="text-[#FF5E2B] font-medium">{progressMsg || 'Estableciendo fijación por satélite...'}</span>
                ) : userLocation?.formattedAddress ? (
                  <span>
                    {userLocation.formattedAddress}
                    {userLocation.accuracyMeters ? (
                      <span className="text-gray-500 ml-1.5 text-[11px]">(±{userLocation.accuracyMeters}m)</span>
                    ) : null}
                  </span>
                ) : (
                  'Activa tu GPS o indica tu municipio para sugerir experiencias a menos de 5 km.'
                )}
              </p>
            </div>
          </div>

          {/* Lado derecho: Acciones interactivas */}
          <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
            <button
              type="button"
              onClick={handleRequestGps}
              disabled={status === 'locating'}
              className={`py-2 px-3.5 rounded-xl font-bold text-xs transition flex items-center gap-2 cursor-pointer shadow-sm ${
                isGpsActive
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-[#FF5E2B] hover:bg-[#E84D1C] text-white shadow-[0_0_15px_rgba(255,94,43,0.3)]'
              }`}
            >
              {status === 'locating' ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                  </svg>
                  <span>Conectando...</span>
                </>
              ) : (
                <>
                  <span>🛰️</span>
                  <span>{isGpsActive ? 'Actualizar GPS' : 'Usar mi ubicación actual'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsManualInputOpen(!isManualInputOpen)}
              className="py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold text-gray-300 hover:text-white transition cursor-pointer"
              title="Cambiar municipio o buscar ciudad"
            >
              {isManualInputOpen ? 'Cerrar' : 'Cambiar ciudad'}
            </button>
          </div>
        </div>

        {/* Mensaje de error / aviso suave si fue denegado */}
        {errorMessage && (
          <div className="mt-3 pt-3 border-t border-white/[0.08] flex items-start gap-2 text-xs text-amber-300/90 leading-snug">
            <span className="text-sm flex-shrink-0 mt-0.5">ℹ️</span>
            <div>
              <p className="font-semibold">{errorMessage}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                La aplicación funciona al 100% indicando tu municipio en el buscador a continuación.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Panel Desplegable: Entrada Manual Suave y Chips de Fallback */}
      {isManualInputOpen && (
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3.5 animate-fade-in">
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-300">
              Indica tu municipio o ciudad de referencia
            </h4>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Se recordará automáticamente para tus próximas sesiones en este dispositivo.
            </p>
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-grow">
              <input
                type="text"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder="Ej. Vigo, Gijón, Granada, Madrid, A Coruña..."
                className="w-full bg-[#0F1015] border border-white/15 focus:border-[#FF5E2B] rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none transition shadow-inner"
              />
              {manualQuery && (
                <button
                  type="button"
                  onClick={() => setManualQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={!manualQuery.trim() || isSearchingManual}
              className="py-2.5 px-4 bg-[#FF5E2B] hover:bg-[#E84D1C] disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer flex-shrink-0"
            >
              {isSearchingManual ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                  </svg>
                  <span>Buscando</span>
                </>
              ) : (
                <span>Establecer</span>
              )}
            </button>
          </form>

          {/* Chips de Selección Rápida */}
          <div className="pt-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Acceso rápido:
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {POPULAR_QUICK_CITIES.map((city) => (
                <button
                  key={city.name}
                  type="button"
                  onClick={() => handleSelectQuickCity(city)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition cursor-pointer ${
                    userLocation?.cityName?.toLowerCase() === city.name.toLowerCase()
                      ? 'bg-[#FF5E2B]/20 border-[#FF5E2B] text-white'
                      : 'bg-white/[0.04] border-white/10 text-gray-300 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  {city.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GpsLocationWidget;
