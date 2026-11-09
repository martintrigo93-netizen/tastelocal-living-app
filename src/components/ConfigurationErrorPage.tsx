import React from 'react';

const ConfigurationErrorPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-[#0F1015] text-white animate-fade-in select-none">
      <div className="w-16 h-16 rounded-2xl bg-[#FF5E2B]/10 border border-[#FF5E2B]/30 text-[#FF5E2B] flex items-center justify-center text-3xl mb-4 shadow-lg">
        🔑
      </div>
      <h2 className="text-xl md:text-2xl font-black mb-2 tracking-tight text-white">Configuración de Google Maps requerida</h2>
      <p className="max-w-md text-xs md:text-sm text-gray-400 leading-relaxed">
        TasteLocal Living utiliza Google Maps Platform para verificar lugares y trazar rutas reales sin alucinaciones.
      </p>
      <div className="mt-6 text-left bg-white/[0.04] p-5 rounded-2xl border border-white/10 text-xs w-full max-w-md shadow-2xl backdrop-blur-md">
        <p className="font-bold text-[#FF5E2B] mb-2 uppercase tracking-wider text-[11px]">Pasos para activar:</p>
        <p className="text-gray-300 leading-relaxed">
          Acepta los términos de Google Maps Platform en el panel de configuración o configura la clave de API en las variables de entorno como <code className="bg-white/10 px-1.5 py-0.5 rounded text-white">VITE_GOOGLE_MAPS_API_KEY</code>.
        </p>
      </div>
    </div>
  );
};

export default ConfigurationErrorPage;
