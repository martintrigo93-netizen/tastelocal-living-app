import { SearchCriteria, WeatherInfo } from '../types';

export function getEventBasedSearchQueries(
  criteria: SearchCriteria,
  weather: WeatherInfo | null
): string[] {
  const queries: string[] = [];
  const isRainy =
    weather &&
    weather.isAvailable &&
    (weather.alertLevel === 'severe' ||
      weather.condition.toLowerCase().includes('rain') ||
      weather.condition.toLowerCase().includes('lluvia'));

  // Base queries based on environment
  switch (criteria.environment) {
    case 'Naturaleza':
      if (isRainy) {
        queries.push(
          'jardín botánico cubierto',
          'invernadero o vivero con encanto',
          'cafetería con plantas'
        );
      } else {
        queries.push('parque o jardín emblemático', 'mirador natural', 'paseo arbolado');
      }
      break;
    case 'Cultural':
      queries.push(
        'museo local o galería de arte',
        'monumento histórico o centro cultural',
        'librería independiente'
      );
      break;
    case 'Gastronómico':
      if (criteria.intensity > 6) {
        queries.push(
          'mercado gastronómico bullicioso',
          'ruta de tapas tradicional',
          'restaurante con cocina abierta'
        );
      } else {
        queries.push('café de especialidad tranquilo', 'bistró acogedor', 'pastelería artesanal');
      }
      break;
    case 'Playa / Agua':
      if (isRainy) {
        queries.push(
          'acuario o museo marítimo',
          'restaurante con vistas al mar',
          'cafetería puerto'
        );
      } else {
        queries.push('paseo marítimo o ribera', 'playa o cala', 'chiringuito terraza');
      }
      break;
    case 'Nocturno':
      queries.push('coctelería de autor', 'terraza rooftop con vistas', 'local con música en vivo');
      break;
    case 'Urbano':
    default:
      queries.push('plaza histórica peatonal', 'barrio pintoresco con encanto', 'mirador urbano');
      break;
  }

  // Adjust by mood and company
  if (criteria.company === 'En pareja') {
    queries.push('rincón romántico acogedor', 'terraza con velas o vistas íntimas');
  } else if (criteria.company === 'Con amigos') {
    queries.push('terraza animada de reunión', 'actividad divertida en grupo');
  } else if (criteria.company === 'En Familia') {
    queries.push(
      'restaurante amplio familiar con terraza tranquila',
      'centro cultural interactivo o paseo accesible mirador'
    );
  } else if (criteria.company === 'Con Niños') {
    queries.push(
      'parque infantil con zona de juegos segura',
      'cafetería family friendly terraza peatonal',
      'museo interactivo o ruta natural corta'
    );
  } else if (criteria.company === 'Con mascota') {
    queries.push('parque o terraza pet-friendly con encanto', 'cafetería con terraza dog-friendly');
  } else if (criteria.company === 'En solitario') {
    queries.push('café de lectura acogedor', 'mirador tranquilo para desconectar');
  }

  // Adjust by budget
  if (criteria.budget?.includes('Económico')) {
    queries.push('espacio público singular', 'parque emblemático con acceso libre');
  } else if (criteria.budget?.includes('Especial')) {
    queries.push('restaurante de autor con encanto', 'coctelería de autor premium');
  }

  // Rain Mode: ensure covered, warm sanctuaries
  if (isRainy) {
    queries.push('café de especialidad acogedor a cubierto', 'librería café resguardada', 'espacio cultural íntimo cubierto');
  }

  // Contexto horario dinámico
  const hour = new Date().getHours();
  if (hour >= 20 || hour < 5) {
    queries.push('restaurante para cena con encanto', 'bar de cócteles de autor íntimo');
  } else if (hour >= 13 && hour < 16) {
    queries.push('bistró con cocina de mercado', 'restaurante gastronómico local');
  } else if (hour >= 6 && hour < 12) {
    queries.push('café de especialidad desayuno', 'panadería artesanal con café');
  }

  // Geofencing Estricto: Si hay un municipio definido y no es Escapada, orientar todas las consultas a dicho municipio
  const cityName =
    criteria.cityName ||
    criteria.location?.cityName ||
    (typeof criteria.location?.formattedAddress === 'string'
      ? criteria.location.formattedAddress.split(',')[0].trim()
      : undefined);

  if (cityName && criteria.environment !== 'Escapada') {
    return queries.map((q) => `${q} en ${cityName}`);
  }

  return queries;
}
