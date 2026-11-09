# TasteLocal Living

Aplicación React + TypeScript creada inicialmente en Google AI Studio.

## Requisitos

- Node.js 20 o superior (recomendado).
- npm.
- Credenciales independientes de Gemini, Google Maps y OpenWeather.

## Ejecución local

1. Instala dependencias: `npm install`.
2. Copia `.env.example` a `.env.local`.
3. Completa las variables localmente. `GEMINI_API_KEY` corresponde a Gemini, `GOOGLE_MAPS_API_KEY` a Maps/Places y `OPENWEATHER_API_KEY` a OpenWeather.
4. Arranca el servidor: `npm run dev`.
5. Genera una compilación: `npm run build`.

## Seguridad: limitación conocida

Esta versión todavía realiza llamadas a Gemini, Google Maps y OpenWeather desde el navegador. Las claves incluidas en una compilación cliente pueden ser extraídas por sus usuarios. La clave de Google Maps debe restringirse por HTTP referrer y APIs; aun así, las restricciones no sustituyen un backend. Gemini y OpenWeather deben moverse a un backend/serverless antes de producción. **No publiques esta arquitectura con claves privadas ni consideres seguras las credenciales por estar en `.env.local`.**

Antes de producción, mueve las llamadas que usan credenciales privadas a un backend/serverless con variables de entorno del servidor, valida las entradas y limita uso/coste. Para Google Maps JavaScript puede mantenerse una clave pública separada, restringida por dominio y por API.

## Datos y resultados

- Los lugares del itinerario deben proceder de resultados reales de Google Places. Si no hay resultados, la aplicación muestra un error en lugar de asignar coordenadas ficticias a lugares inventados.
- Las alertas de tráfico y los puntos de interés de ruta no se simulan; permanecen vacíos hasta integrar una fuente verificable.
- `.env.local` y cualquier archivo con credenciales no deben compartirse ni versionarse.
