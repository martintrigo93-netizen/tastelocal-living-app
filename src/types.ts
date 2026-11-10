export type Page = 'welcome' | 'home' | 'itinerary';

export interface UserLocation {
  lat: number;
  lng: number;
  cityName?: string;
  formattedAddress?: string;
}

export interface Mood {
  label: string;
  icon: string;
}

export interface Entorno {
  label: string;
  icon: string;
}

export interface Company {
  label: string;
  icon: string;
}

export interface BudgetOption {
  label: string; // 'Económico', 'Normal', 'Especial'
  symbol: string; // '€', '€€', '€€€'
  description: string;
}

export interface UserAffinities {
  favoriteEnvironments: Record<string, number>;
  favoriteMoods: Record<string, number>;
  favoriteIntensities: Record<number, number>;
  averageIntensity: number;
  preferredBudget?: string;
  preferredCompany?: string;
  totalSearches: number;
  totalSavedExperiences: number;
  lastUpdated: string;
}

export interface Mobility {
  label: string;
  icon: string;
  googleMode: 'WALKING' | 'TRANSIT' | 'DRIVING' | 'BICYCLING';
}

export interface SearchCriteria {
  user_mood: string;
  environment: string;
  company: string;
  mobility: string;
  location: UserLocation;
  cityName?: string;
  intensity: number;
  availableTime?: '< 2h' | '2-4h' | 'Día completo';
  user_mood_description?: string;
  budget?: string; // '€ Económico' | '€€ Normal' | '€€€ Especial'
  localTime?: string; // Formato hora local e.g. "14:30" o ISO
  timePeriod?: 'morning' | 'midday' | 'afternoon' | 'night';
  userAffinities?: {
    topEnvironments: string[];
    topMoods?: string[];
    preferredIntensity?: number;
    preferredBudget?: string;
    totalSearches: number;
    totalSavedExperiences?: number;
    summaryNarrative?: string;
  };
  isSurpriseMe?: boolean;
}

export interface PlaceAccessibilityOptions {
  wheelchairAccessibleEntrance?: boolean;
  wheelchairAccessibleParking?: boolean;
  wheelchairAccessibleRestroom?: boolean;
  wheelchairAccessibleSeating?: boolean;
  isConfirmedAccessible?: boolean;
}

export interface Plan {
  id: string;
  name: string;
  description?: string;
  location: UserLocation;
  rating?: number;
  address?: string;
  types?: string[];
  photoUrl?: string;
  phoneNumber?: string;
  websiteUri?: string;
  allowsDogs?: boolean;
  accessibilityOptions?: PlaceAccessibilityOptions;
}

export interface RouteInfo {
  duration: string;
  distance: string;
  travelMode: 'WALKING' | 'TRANSIT' | 'DRIVING' | 'BICYCLING';
  trafficAlert?: string;
  weatherAlert?: string;
  suggestedPois: Array<{ name: string; type: string }>;
  encodedPolyline?: string;
}

export interface ScheduleItem {
  time: string;
  activity: string;
  placeName: string;
  placeId: string;
  placeAddress: string;
  location?: UserLocation;
  routeInfo?: RouteInfo;
  description?: string;
  rating?: number;
  phoneNumber?: string;
  websiteUri?: string;
  allowsDogs?: boolean;
  ambience?: 'calm' | 'lively';
  accessibilityOptions?: PlaceAccessibilityOptions;
}

export interface SavedExperience {
  id: string;
  savedAt: string; // ISO date
  plan: ProposalPlan;
  moodLabel?: string;
  cityContext?: string;
}

export interface PlanDetails {
  title: string;
  shortDescription: string;
  schedule: ScheduleItem[];
}

export interface PremiumContingencyPlan extends PlanDetails {
  reasonForChange: string;
}

export interface ProposalPlan extends PlanDetails {
  id: 'ideal' | 'alternative' | 'surprise' | 'essential';
  badge: string; // e.g. "PLAN IDEAL", "PLAN ALTERNATIVO", "PLAN SORPRESA"
  tagline: string; // e.g. "La recomendación más fiel a tu energía"
  matchReason: string; // "Por qué conecta con cómo te sientes hoy"
  approxDuration: string; // e.g. "< 2h", "2-4h", "Día completo"
  experienceNarrative?: string; // "Qué vas a vivir y por qué merece la pena"
  budgetEstimate?: string; // e.g. "20€ - 35€ / pers."
  energyRequired?: string; // e.g. "Ritmo pausado"
  totalDistance?: string;
  coverImage?: string;
  accessibilityInfo?: string; // e.g. "Acceso peatonal accesible y sin desniveles pronunciados"
  isPlanB?: boolean;
}

export interface GeneratedItinerary {
  proposals: ProposalPlan[];
  selectedProposalId?: 'ideal' | 'alternative' | 'surprise' | 'essential';
  mainPlan: PlanDetails;
  premiumContingencyPlan?: PremiumContingencyPlan;
  isGeographicallyOptimized?: boolean;
  isPlanBActive?: boolean;
  planBReason?: string;
}

export interface WeatherInfo {
  temp: number | null;
  condition: string;
  description: string;
  icon: string;
  alertLevel: 'clear' | 'warning' | 'severe' | 'unavailable';
  summary: string;
  isAvailable: boolean;
  isRainy?: boolean;
  isHot?: boolean;
}
