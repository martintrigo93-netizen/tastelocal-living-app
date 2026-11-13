export type Page = 'welcome' | 'home' | 'itinerary' | 'group';

export interface UserLocation {
  lat: number;
  lng: number;
  cityName?: string;
  formattedAddress?: string;
  neighborhood?: string;
  isGps?: boolean;
  accuracyMeters?: number;
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

export interface VisitedPlace {
  id: string;
  name: string;
  address?: string;
  cityName?: string;
  visitedAt: string; // ISO date
}

export interface UserTasteProfile {
  preferredCategories: Record<string, number>;
  preferredMoods: Record<string, number>;
  preferredEnergyLevels: number[];
  averageEnergy: number;
  recurringPreferences: string[];
  manualRestrictions: string[];
  summary: string;
  totalInteractions: number;
  lastUpdated: string;
}

export type ExperienceMode = 'single' | 'chained';

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
  isGpsActive?: boolean;
  searchRadiusKm?: number;
  latitude?: number;
  longitude?: number;
  allowSurroundings?: boolean;
  onlyOpenNow?: boolean; // Filtro "Solo abiertos ahora"
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
  visitedPlaces?: Array<{ id: string; name: string }>;
  userTasteProfile?: {
    summary: string;
    manualRestrictions: string[];
    recurringPreferences: string[];
    averageEnergy: number;
  };
  isSurpriseMe?: boolean;
  experienceMode?: ExperienceMode;
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
  userRatingsTotal?: number;
  priceLevel?: string;
  isOpenNow?: boolean;
  isLocalSuggestion?: boolean;
  address?: string;
  types?: string[];
  photoUrl?: string;
  phoneNumber?: string;
  websiteUri?: string;
  allowsDogs?: boolean;
  verifiedSource?: 'google_places' | 'openstreetmap';
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
  userRatingsTotal?: number;
  priceLevel?: string;
  isOpenNow?: boolean;
  isLocalSuggestion?: boolean;
  photoUrl?: string;
  phoneNumber?: string;
  websiteUri?: string;
  allowsDogs?: boolean;
  ambience?: 'calm' | 'lively';
  accessibilityOptions?: PlaceAccessibilityOptions;
  order?: number;
  walkingTimeFromPrevious?: string;
  verifiedSource?: 'google_places' | 'openstreetmap';
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
  photoUrl?: string;
  isOpenNow?: boolean;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: string;
  isLocalSuggestion?: boolean;
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
  experienceMode?: ExperienceMode;
  photoUrl?: string;
  isOpenNow?: boolean;
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: string;
  isLocalSuggestion?: boolean;
}

export interface GeneratedItinerary {
  proposals: ProposalPlan[];
  selectedProposalId?: 'ideal' | 'alternative' | 'surprise' | 'essential';
  mainPlan: PlanDetails;
  premiumContingencyPlan?: PremiumContingencyPlan;
  isGeographicallyOptimized?: boolean;
  isPlanBActive?: boolean;
  planBReason?: string;
  aiFallbackNotice?: string;
}

export interface StructuredApiError {
  code: string;
  message: string;
  requestId?: string;
  retryable?: boolean;
  suggestedRadiusKm?: number;
  retryAfterSeconds?: number;
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

export interface SwipeCardItem {
  id: string;
  title: string;
  placeName: string;
  placeAddress: string;
  neighborhood: string;
  ambience: string;
  priceLevel?: string;
  isOpenNow?: boolean;
  rating?: number;
  userRatingsTotal?: number;
  photoUrl: string;
  shortDescription: string;
  matchReason?: string;
  categoryTag: string;
  location: { lat: number; lng: number };
  estimatedDuration?: string;
  isLocalSuggestion?: boolean;
  verifiedSource?: 'google_places' | 'openstreetmap';
}

export type SwipeVote = 'like' | 'pass';

export interface GroupSwipeSession {
  sessionId: string;
  cityName: string;
  deck: SwipeCardItem[];
  p1Votes: Record<string, SwipeVote>;
  p2Votes?: Record<string, SwipeVote>;
  createdAt: string;
}

