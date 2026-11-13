import { Mood, Entorno, Company, Mobility, BudgetOption, ExperienceMode } from './types';

export type MobilityOption = Mobility;
export type EntornoOption = Entorno;

export interface ExperienceModeOption {
  id: ExperienceMode;
  label: string;
  badge: string;
  icon: string;
  subtext: string;
}

export const EXPERIENCE_MODE_OPTIONS: ExperienceModeOption[] = [
  {
    id: 'chained',
    label: 'Ruta Encadenada (2-3 Paradas)',
    badge: 'Media Jornada • ≤ 15 min a pie',
    icon: '🔗',
    subtext: 'Itinerario secuencial coherente de 3 paradas conectadas a pie.',
  },
  {
    id: 'single',
    label: 'Plan Único',
    badge: '1 Experiencia Clave',
    icon: '🎯',
    subtext: 'Recomendación destacada individual para disfrutar a tu ritmo.',
  },
];

export const MOOD_OPTIONS: Mood[] = [
  { label: 'Relajado', icon: '😌' },
  { label: 'Aventurero', icon: '🤠' },
  { label: 'Romántico', icon: '🥰' },
  { label: 'Festivo', icon: '🥳' },
  { label: 'Curioso', icon: '🧐' },
  { label: 'Tranquilo', icon: '🧘' },
];

export interface AvailableTimeOption {
  id: '< 2h' | '2-4h' | 'Día completo';
  label: string;
  icon: string;
  description: string;
}

export const AVAILABLE_TIME_OPTIONS: AvailableTimeOption[] = [
  { id: '< 2h', label: '< 2h', icon: '⚡', description: 'Pausa rápida o experiencia exprés' },
  { id: '2-4h', label: '2-4h', icon: '⏱️', description: 'Ruta equilibrada con ritmo cómodo' },
  { id: 'Día completo', label: 'Día completo', icon: '🌅', description: 'Inmersión profunda sin mirar el reloj' },
];

export const ENTORNO_OPTIONS: EntornoOption[] = [
  { label: 'Mar', icon: '🌊' },
  { label: 'Montaña', icon: '⛰️' },
  { label: 'Ciudad', icon: '🏙️' },
  { label: 'Río', icon: '🛶' },
  { label: 'Pueblo', icon: '🏡' },
  { label: 'Escapada', icon: '🚗' },
];

export const COMPANY_OPTIONS: Company[] = [
  { label: 'En solitario', icon: '🧍' },
  { label: 'En pareja', icon: '💑' },
  { label: 'Con amigos', icon: '👥' },
  { label: 'En Familia', icon: '👨‍👩‍👧‍👦' },
  { label: 'Con Niños', icon: '🧸' },
  { label: 'Con mascota', icon: '🐾' },
];

export const BUDGET_OPTIONS: BudgetOption[] = [
  { label: 'Económico', symbol: '€', description: 'Accesible, planes libres o consumo moderado' },
  { label: 'Normal', symbol: '€€', description: 'Equilibrado, bistrós y actividades estándar' },
  { label: 'Especial', symbol: '€€€', description: 'Experiencia premium, alta cocina o lugares selectos' },
];

export const MOBILITY_OPTIONS: MobilityOption[] = [
  { label: 'A pie', icon: '🚶', googleMode: 'WALKING' },
  { label: 'Transporte público', icon: '🚌', googleMode: 'TRANSIT' },
  { label: 'Coche / Moto', icon: '🚗', googleMode: 'DRIVING' },
  { label: 'Bicicleta', icon: '🚲', googleMode: 'BICYCLING' },
];
