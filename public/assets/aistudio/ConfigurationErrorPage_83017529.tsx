import React from 'react';

const ConfigurationErrorPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-red-50 text-red-800">
        <i className="fas fa-key text-5xl mb-4 text-red-500"></i>
        <h2 className="text-2xl font-bold mb-2">¡Casi listo! Falta la configuración.</h2>
        <p className="max-w-md">
            Para funcionar, esta aplicación necesita claves independientes para Gemini, Google Maps y OpenWeather.
        </p>
        <div className="mt-6 text-left bg-red-100 p-4 rounded-lg text-sm w-full max-w-lg shadow-md">
            <p className="font-bold text-base mb-3 text-red-900">Sigue estos 3 sencillos pasos:</p>
            <ol className="list-decimal list-inside space-y-4">
                <li>
                    <strong className="font-semibold">Crea un archivo:</strong> En el directorio principal de tu proyecto (la misma carpeta donde está <code>index.html</code>), crea un nuevo archivo y nómbralo exactamente <code>.env.local</code>
                </li>
                <li>
                    <strong className="font-semibold">Copia y pega este texto:</strong> Abre el archivo <code>.env.local</code> que acabas de crear y pega el siguiente contenido. Luego, reemplaza los textos de ejemplo con tus claves reales.
                    <pre className="bg-red-200 text-red-900 p-3 rounded-md mt-2 text-xs overflow-x-auto font-mono">
                        <code>
                            # Clave de Gemini AI
                            <br/>
                            GEMINI_API_KEY=aqui_va_tu_clave_de_gemini
                            <br/>
                            <br/>
                            # Clave de Google Maps / Places (restringida por dominio y API)
                            <br/>
                            GOOGLE_MAPS_API_KEY=aqui_va_tu_clave_de_maps
                            <br/>
                            <br/>
                            # Clave para el servicio del clima
                            <br/>
                            OPENWEATHER_API_KEY=aqui_va_tu_clave_de_openweather
                        </code>
                    </pre>
                    <span className="block text-xs text-red-700 ml-5 mt-1">Asegúrate de no dejar espacios y de no usar comillas.</span>
                </li>
                <li>
                    <strong className="font-semibold text-yellow-800 bg-yellow-200 px-1 rounded">¡REINICIA EL SERVIDOR!</strong> Guarda el archivo <code>.env.local</code> y detén tu servidor de desarrollo (usualmente con Ctrl+C en la terminal) y vuelve a iniciarlo. Este paso es crucial para que se carguen las nuevas claves.
                </li>
            </ol>
            <p className="mt-4 pt-3 border-t border-red-200 font-semibold text-gray-700">
                <i className="fas fa-shield-alt mr-2 text-gray-500"></i>Por tu seguridad, nunca compartas tus claves de API públicamente.
            </p>
        </div>
    </div>
  );
};

export default ConfigurationErrorPage;