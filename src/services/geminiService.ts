import { Mood, SearchCriteria, WeatherInfo, Plan, GeneratedItinerary } from '../types';
import { analyzeMoodProxy, generateItineraryProxy } from './apiProxy';

/**
 * Analiza el estado de ánimo y texto libre expresado por el usuario usando Gemini en el backend.
 */
export async function analyzeMoodFromText(text: string): Promise<Mood> {
  return await analyzeMoodProxy(text);
}

/**
 * Genera un itinerario estructurado mediante Gemini actuando exclusivamente como motor narrativo/creativo
 * sobre la lista de lugares reales verificados. Si no hay lugares disponibles o si se devuelven lugares
 * no verificados, se descartan automáticamente.
 */
export async function generateItinerary(params: {
  criteria: SearchCriteria;
  weather: WeatherInfo | null;
  places: Plan[];
}): Promise<GeneratedItinerary> {
  if (!params.places || params.places.length === 0) {
    throw new Error(
      'Sin resultados suficientes en esta zona. Se requieren lugares reales verificados para construir el plan.'
    );
  }

  const result = await generateItineraryProxy(params);

  // Validación y blindaje en el cliente: descartar cualquier lugar no coincidente con los lugares verificados
  const verifiedMap = new Map<string, Plan>();
  params.places.forEach((p) => {
    verifiedMap.set(p.id, p);
    verifiedMap.set(p.name.toLowerCase().trim(), p);
  });

  if (result.proposals && Array.isArray(result.proposals)) {
    result.proposals = result.proposals.map((prop) => ({
      ...prop,
      schedule: prop.schedule
        ? prop.schedule.filter((item: { placeId?: string; placeName?: string }) => {
            const match =
              (item.placeId && verifiedMap.get(item.placeId)) ||
              (item.placeName && verifiedMap.get(item.placeName.toLowerCase().trim()));
            return Boolean(match);
          })
        : [],
    }));
  }

  if (result.mainPlan?.schedule) {
    result.mainPlan.schedule = result.mainPlan.schedule.filter((item) => {
      const match =
        verifiedMap.get(item.placeId) ||
        verifiedMap.get(item.placeName.toLowerCase().trim());
      return Boolean(match);
    });
  }

  if (result.premiumContingencyPlan?.schedule) {
    result.premiumContingencyPlan.schedule = result.premiumContingencyPlan.schedule.filter((item) => {
      const match =
        verifiedMap.get(item.placeId) ||
        verifiedMap.get(item.placeName.toLowerCase().trim());
      return Boolean(match);
    });
  }

  if (!result.mainPlan?.schedule || result.mainPlan.schedule.length === 0) {
    throw new Error(
      'Sin resultados suficientes: el planificador no pudo asociar suficientes lugares verificados en esta zona.'
    );
  }

  return result;
}
