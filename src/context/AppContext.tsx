import React, { createContext, useState, useCallback, useContext, type ReactNode } from 'react';
import {
  type Page,
  type SearchCriteria,
  type UserLocation,
  type Mood,
  type Company,
  type BudgetOption,
  type GeneratedItinerary,
  type ProposalPlan,
  type Plan,
  type PlanDetails,
  type ScheduleItem,
  type WeatherInfo,
  type SavedExperience,
  type UserAffinities,
  type VisitedPlace,
  type UserTasteProfile,
  type SwipeCardItem,
  type GroupSwipeSession,
  type StructuredApiError,
} from '../types';
import { generateItinerary } from '../services/geminiService';
import { generateGroupDeckProxy, getGroupSessionProxy, ApiClientError } from '../services/apiProxy';
import { decodeGroupSessionPayload } from '../utils/groupSessionCodec';
import { findPotentialPlaces } from '../services/googleMapsService';
import { getEventBasedSearchQueries } from '../services/eventsService';
import { getWeather } from '../services/weatherService';
import { enrichItineraryWithRoutes } from '../services/routingService';
import {
  type MobilityOption,
  MOBILITY_OPTIONS,
  type EntornoOption,
  COMPANY_OPTIONS,
  BUDGET_OPTIONS,
  ENTORNO_OPTIONS,
} from '../constants';
import { getLastSavedLocation, saveLastLocation } from '../services/geolocationService';

export interface FormState {
  mood: Mood | null;
  moodDescription: string;
  entorno: EntornoOption | null;
  company: Company | null;
  budget: BudgetOption | null;
  mobility: MobilityOption | null;
  intensity: number;
  availableTime: '< 2h' | '2-4h' | 'Día completo';
  experienceMode: 'single' | 'chained';
  onlyOpenNow: boolean;
}

export interface AppState {
  page: Page;
  itinerary: GeneratedItinerary | null;
  weather: WeatherInfo | null;
  searchCriteria: SearchCriteria | null;
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;
  errorDetails?: StructuredApiError | null;
  userLocation: UserLocation | null;
  formState: FormState;
}

export interface AppContextType extends AppState {
  savedPlans: SavedExperience[];
  userAffinities: UserAffinities;
  visitedPlaces: VisitedPlace[];
  userTasteProfile: UserTasteProfile;
  isSavedPlansModalOpen: boolean;
  setIsSavedPlansModalOpen: (open: boolean) => void;
  isPreferencesModalOpen: boolean;
  setIsPreferencesModalOpen: (open: boolean) => void;
  savePlan: (plan: ProposalPlan) => void;
  removeSavedPlan: (planId: string) => void;
  clearSavedPlans: () => void;
  isPlanSaved: (planId: string) => boolean;
  openSavedPlan: (saved: SavedExperience) => void;
  toggleVisitedPlace: (place: { id: string; name: string; address?: string; cityName?: string }) => boolean;
  removeVisitedPlace: (placeId: string, placeName?: string) => void;
  clearVisitedPlaces: () => void;
  isPlaceVisited: (placeId?: string, placeName?: string) => boolean;
  toggleManualRestriction: (restriction: string) => void;
  resetTasteProfile: () => void;
  setUserLocation: (location: UserLocation | null) => void;
  setFormState: (newState: Partial<FormState>) => void;
  handleGenerateItinerary: (criteria: SearchCriteria) => Promise<void>;
  handleExpandSearchRadius: (newRadiusKm?: number) => Promise<void>;
  handleRetryLastSearch: () => Promise<void>;
  handleSurpriseMe: (locationOverride?: UserLocation) => Promise<void>;
  handleBackToHome: () => void;
  groupDeck: SwipeCardItem[];
  groupDeckCity: string;
  groupLoading: boolean;
  groupError: string | null;
  groupErrorDetails: StructuredApiError | null;
  incomingGroupSession: GroupSwipeSession | null;
  handleStartGroupMode: (locationOverride?: UserLocation, radiusOverride?: number) => Promise<void>;
  handleExitGroupMode: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

const initialFormState: FormState = {
  mood: null,
  moodDescription: '',
  entorno: null,
  company: COMPANY_OPTIONS[0],
  budget: BUDGET_OPTIONS[1],
  mobility: MOBILITY_OPTIONS.find((m) => m.label === 'A pie') || MOBILITY_OPTIONS[0],
  intensity: 5,
  availableTime: '2-4h',
  experienceMode: 'chained',
  onlyOpenNow: false,
};

const SYNTHETIC_ID_REGEX = /^(poi-|resilient-poi-|gemini-poi-|group-card-)/i;

// Helper strictly guaranteeing verified coordinates and addresses from Google Places / OpenStreetMap
const enrichScheduleWithLocations = <T extends PlanDetails>(planDetails: T, places: Plan[]): T => {
  if (!planDetails || !planDetails.schedule) return planDetails;

  const placesById: Record<string, Plan> = {};
  places.forEach((p) => {
    placesById[p.id] = p;
    placesById[p.name.toLowerCase().trim()] = p;
  });

  const enrichedSchedule = planDetails.schedule
    .map((item: ScheduleItem): ScheduleItem | null => {
      const matchedPlace =
        placesById[item.placeId] ||
        placesById[item.placeName.toLowerCase().trim()];

      if (!matchedPlace) {
        const isBackendVerified =
          Boolean(item.placeId) &&
          !SYNTHETIC_ID_REGEX.test(item.placeId) &&
          (item.verifiedSource === 'google_places' || item.verifiedSource === 'openstreetmap') &&
          Boolean(item.location && typeof item.location.lat === 'number' && typeof item.location.lng === 'number');
        return isBackendVerified ? item : null;
      }

      return {
        ...item,
        placeId: matchedPlace.id || item.placeId,
        placeName: matchedPlace.name || item.placeName,
        placeAddress: matchedPlace.address || item.placeAddress,
        location: matchedPlace.location || item.location,
        rating: item.rating ?? matchedPlace.rating,
        userRatingsTotal: item.userRatingsTotal ?? matchedPlace.userRatingsTotal,
        priceLevel: item.priceLevel ?? matchedPlace.priceLevel,
        isOpenNow: item.isOpenNow ?? matchedPlace.isOpenNow,
        photoUrl: item.photoUrl || matchedPlace.photoUrl,
        isLocalSuggestion: item.isLocalSuggestion ?? matchedPlace.isLocalSuggestion,
        verifiedSource: item.verifiedSource || matchedPlace.verifiedSource,
        phoneNumber: matchedPlace.phoneNumber || item.phoneNumber,
        websiteUri: matchedPlace.websiteUri || item.websiteUri,
        allowsDogs: matchedPlace.allowsDogs ?? item.allowsDogs,
        accessibilityOptions: matchedPlace.accessibilityOptions || item.accessibilityOptions,
      };
    })
    .filter((item): item is ScheduleItem => item !== null);

  return { ...planDetails, schedule: enrichedSchedule };
};

const SAVED_PLANS_KEY = 'tastelocal_saved_plans_v1';
const AFFINITIES_KEY = 'tastelocal_user_affinities_v1';
const VISITED_PLACES_KEY = 'visitedPlaces';
const TASTE_PROFILE_KEY = 'userTasteProfile';

const defaultAffinities: UserAffinities = {
  favoriteEnvironments: {},
  favoriteMoods: {},
  favoriteIntensities: {},
  averageIntensity: 5.0,
  totalSearches: 0,
  totalSavedExperiences: 0,
  lastUpdated: new Date().toISOString(),
};

const defaultTasteProfile: UserTasteProfile = {
  preferredCategories: {},
  preferredMoods: {},
  preferredEnergyLevels: [],
  averageEnergy: 5.0,
  recurringPreferences: [],
  manualRestrictions: [],
  summary: 'Explorador local equilibrado en construcción silenciosa.',
  totalInteractions: 0,
  lastUpdated: new Date().toISOString(),
};

const buildTasteProfileSummary = (profile: {
  preferredCategories: Record<string, number>;
  preferredMoods: Record<string, number>;
  averageEnergy: number;
  recurringPreferences: string[];
  manualRestrictions: string[];
  totalInteractions: number;
}): string => {
  if (profile.totalInteractions === 0 && profile.manualRestrictions.length === 0) {
    return 'Explorador local buscando experiencias auténticas de barrio.';
  }

  const traits: string[] = [];

  if (profile.averageEnergy <= 4.5) {
    traits.push('ambientes tranquilos y relajados');
  } else if (profile.averageEnergy >= 7.2) {
    traits.push('propuestas activas y dinámicas');
  } else {
    traits.push('ritmo equilibrado sin prisas');
  }

  const topCategories = Object.entries(profile.preferredCategories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([cat]) => cat.toLowerCase());

  if (topCategories.length > 0) {
    traits.push(`entornos ${topCategories.join(' y ')}`);
  }

  profile.recurringPreferences.forEach((pref) => {
    if (!traits.includes(pref.toLowerCase())) {
      traits.push(pref.toLowerCase());
    }
  });

  let summary = `El usuario suele preferir ${traits.slice(0, 4).join(', ')}`;
  if (profile.manualRestrictions.length > 0) {
    summary += `. Restricciones/preferencias activas: ${profile.manualRestrictions.join(', ')}`;
  }
  return summary + '.';
};

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [savedPlans, setSavedPlans] = useState<SavedExperience[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(SAVED_PLANS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('Error reading saved plans from localStorage:', e);
      return [];
    }
  });

  const [visitedPlaces, setVisitedPlaces] = useState<VisitedPlace[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(VISITED_PLACES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('Error reading visitedPlaces from localStorage:', e);
      return [];
    }
  });

  const [userTasteProfile, setUserTasteProfile] = useState<UserTasteProfile>(() => {
    if (typeof window === 'undefined') return defaultTasteProfile;
    try {
      const raw = localStorage.getItem(TASTE_PROFILE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...defaultTasteProfile,
          ...parsed,
          preferredCategories: parsed.preferredCategories || {},
          preferredMoods: parsed.preferredMoods || {},
          preferredEnergyLevels: Array.isArray(parsed.preferredEnergyLevels) ? parsed.preferredEnergyLevels : [],
          recurringPreferences: Array.isArray(parsed.recurringPreferences) ? parsed.recurringPreferences : [],
          manualRestrictions: Array.isArray(parsed.manualRestrictions) ? parsed.manualRestrictions : [],
        };
      }
      return defaultTasteProfile;
    } catch (e) {
      console.warn('Error reading userTasteProfile from localStorage:', e);
      return defaultTasteProfile;
    }
  });

  const [userAffinities, setUserAffinities] = useState<UserAffinities>(() => {
    if (typeof window === 'undefined') return defaultAffinities;
    try {
      const raw = localStorage.getItem(AFFINITIES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          favoriteEnvironments: parsed.favoriteEnvironments || {},
          favoriteMoods: parsed.favoriteMoods || {},
          favoriteIntensities: parsed.favoriteIntensities || {},
          averageIntensity: typeof parsed.averageIntensity === 'number' ? parsed.averageIntensity : 5.0,
          preferredBudget: parsed.preferredBudget,
          preferredCompany: parsed.preferredCompany,
          totalSearches: parsed.totalSearches || 0,
          totalSavedExperiences: parsed.totalSavedExperiences || 0,
          lastUpdated: parsed.lastUpdated || new Date().toISOString(),
        };
      }
      return defaultAffinities;
    } catch (e) {
      console.warn('Error reading user affinities from localStorage:', e);
      return defaultAffinities;
    }
  });

  const [isSavedPlansModalOpen, setIsSavedPlansModalOpen] = useState<boolean>(false);
  const [isPreferencesModalOpen, setIsPreferencesModalOpen] = useState<boolean>(false);
  const [groupDeck, setGroupDeck] = useState<SwipeCardItem[]>([]);
  const [groupDeckCity, setGroupDeckCity] = useState<string>('');
  const [groupLoading, setGroupLoading] = useState<boolean>(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [groupErrorDetails, setGroupErrorDetails] = useState<StructuredApiError | null>(null);
  const [incomingGroupSession, setIncomingGroupSession] = useState<GroupSwipeSession | null>(null);

  const [state, setState] = useState<AppState>(() => {
    const cachedLoc = getLastSavedLocation();
    return {
      page: 'home',
      itinerary: null,
      weather: null,
      searchCriteria: null,
      isLoading: false,
      loadingMessage: '',
      error: null,
      errorDetails: null,
      userLocation: cachedLoc,
      formState: initialFormState,
    };
  });

  // FASE 7: Detectar si se abrió un enlace compartido de votación en pareja/grupo (?gs= o ?g=)
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const gsId = params.get('gs');
    const encodedPayload = params.get('g');
    if (!gsId && !encodedPayload) return;

    let cancelled = false;
    (async () => {
      let hydrated: GroupSwipeSession | null = null;
      if (gsId) {
        hydrated = await getGroupSessionProxy(gsId);
      }
      if (!hydrated && encodedPayload) {
        hydrated = decodeGroupSessionPayload(encodedPayload);
      }
      if (!cancelled && hydrated && hydrated.deck.length > 0) {
        setIncomingGroupSession(hydrated);
        setGroupDeck(hydrated.deck);
        setGroupDeckCity(hydrated.cityName);
        setGroupError(null);
        setGroupLoading(false);
        setState((prev) => ({
          ...prev,
          page: 'group',
        }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Helper para registrar y actualizar afinidades locales (Mood Intelligence)
  const recordAffinities = useCallback(
    (params: {
      environment?: string;
      moodLabel?: string;
      intensity?: number;
      budget?: string;
      company?: string;
      isFavoriteSave?: boolean;
    }) => {
      setUserAffinities((prev) => {
        const weight = params.isFavoriteSave ? 2 : 1;

        // 1. Entornos
        const updatedEnv = { ...prev.favoriteEnvironments };
        if (params.environment) {
          updatedEnv[params.environment] = (updatedEnv[params.environment] || 0) + weight;
        }

        // 2. Estados de ánimo
        const updatedMood = { ...prev.favoriteMoods };
        if (params.moodLabel) {
          updatedMood[params.moodLabel] = (updatedMood[params.moodLabel] || 0) + weight;
        }

        // 3. Intensidades (Dial 1 al 10)
        const updatedIntensities = { ...prev.favoriteIntensities };
        if (typeof params.intensity === 'number' && params.intensity >= 1 && params.intensity <= 10) {
          const rounded = Math.round(params.intensity);
          updatedIntensities[rounded] = (updatedIntensities[rounded] || 0) + 1;
        }

        // Calcular media ponderada de intensidad
        let totalIntensityWeighted = 0;
        let totalIntensityCount = 0;
        Object.entries(updatedIntensities).forEach(([levelStr, count]) => {
          const lvl = parseInt(levelStr, 10);
          totalIntensityWeighted += lvl * count;
          totalIntensityCount += count;
        });
        const averageIntensity =
          totalIntensityCount > 0
            ? Math.round((totalIntensityWeighted / totalIntensityCount) * 10) / 10
            : prev.averageIntensity || 5.0;

        const updated: UserAffinities = {
          favoriteEnvironments: updatedEnv,
          favoriteMoods: updatedMood,
          favoriteIntensities: updatedIntensities,
          averageIntensity,
          preferredBudget: params.budget || prev.preferredBudget,
          preferredCompany: params.company || prev.preferredCompany,
          totalSearches: params.isFavoriteSave ? prev.totalSearches : prev.totalSearches + 1,
          totalSavedExperiences: params.isFavoriteSave
            ? prev.totalSavedExperiences + 1
            : prev.totalSavedExperiences,
          lastUpdated: new Date().toISOString(),
        };

        try {
          localStorage.setItem(AFFINITIES_KEY, JSON.stringify(updated));
        } catch (e) {
          console.warn('Error saving affinities to localStorage:', e);
        }

        return updated;
      });

      // Aprendizaje silencioso en userTasteProfile
      setUserTasteProfile((prev) => {
        const weight = params.isFavoriteSave ? 2 : 1;
        const updatedCats = { ...prev.preferredCategories };
        if (params.environment) {
          updatedCats[params.environment] = (updatedCats[params.environment] || 0) + weight;
        }

        const updatedMoods = { ...prev.preferredMoods };
        if (params.moodLabel) {
          updatedMoods[params.moodLabel] = (updatedMoods[params.moodLabel] || 0) + weight;
        }

        const updatedEnergies =
          typeof params.intensity === 'number'
            ? [...prev.preferredEnergyLevels, Math.round(params.intensity)].slice(-25)
            : prev.preferredEnergyLevels;

        const averageEnergy =
          updatedEnergies.length > 0
            ? Math.round((updatedEnergies.reduce((acc, v) => acc + v, 0) / updatedEnergies.length) * 10) / 10
            : prev.averageEnergy;

        const recurringSet = new Set(prev.recurringPreferences);
        if (params.company === 'Con mascota') {
          recurringSet.add('Opciones pet-friendly');
        }
        if (params.company === 'En Familia') {
          recurringSet.add('Planes accesibles en familia');
        }
        if (params.company === 'Con Niños') {
          recurringSet.add('Espacios family-friendly con niños');
        }
        if (params.environment === 'Gastronómico' || params.moodLabel === 'Gastronómico') {
          recurringSet.add('Gastronomía de proximidad');
        }
        if (params.environment === 'Cultural' || params.moodLabel === 'Curioso') {
          recurringSet.add('Cultura y espacios locales');
        }
        if (averageEnergy <= 4.5 || params.moodLabel === 'Tranquilo' || params.moodLabel === 'Relajado') {
          recurringSet.add('Ambiente tranquilo');
        }

        const recurringPreferences = Array.from(recurringSet).slice(0, 6);
        const totalInteractions = prev.totalInteractions + 1;
        const summary = buildTasteProfileSummary({
          preferredCategories: updatedCats,
          preferredMoods: updatedMoods,
          averageEnergy,
          recurringPreferences,
          manualRestrictions: prev.manualRestrictions,
          totalInteractions,
        });

        const nextProfile: UserTasteProfile = {
          preferredCategories: updatedCats,
          preferredMoods: updatedMoods,
          preferredEnergyLevels: updatedEnergies,
          averageEnergy,
          recurringPreferences,
          manualRestrictions: prev.manualRestrictions,
          summary,
          totalInteractions,
          lastUpdated: new Date().toISOString(),
        };

        try {
          localStorage.setItem(TASTE_PROFILE_KEY, JSON.stringify(nextProfile));
        } catch (e) {
          console.warn('Error saving userTasteProfile to localStorage:', e);
        }

        return nextProfile;
      });
    },
    []
  );

  // Gestión de historial "Ya estuve aquí" (visitedPlaces)
  const isPlaceVisited = useCallback(
    (placeId?: string, placeName?: string): boolean => {
      const normalizedName = (placeName || '').toLowerCase().trim();
      return visitedPlaces.some(
        (vp) =>
          (placeId && vp.id === placeId) ||
          (normalizedName && vp.name.toLowerCase().trim() === normalizedName)
      );
    },
    [visitedPlaces]
  );

  const toggleVisitedPlace = useCallback(
    (place: { id: string; name: string; address?: string; cityName?: string }): boolean => {
      let markedAsVisited = false;
      const normalizedName = place.name.toLowerCase().trim();

      setVisitedPlaces((prev) => {
        const exists = prev.some(
          (vp) =>
            (place.id && vp.id === place.id) ||
            (normalizedName && vp.name.toLowerCase().trim() === normalizedName)
        );

        let updated: VisitedPlace[];
        if (exists) {
          markedAsVisited = false;
          updated = prev.filter(
            (vp) =>
              !(place.id && vp.id === place.id) &&
              !(normalizedName && vp.name.toLowerCase().trim() === normalizedName)
          );
        } else {
          markedAsVisited = true;
          const entry: VisitedPlace = {
            id: place.id || `visited-${Date.now()}`,
            name: place.name,
            address: place.address,
            cityName: place.cityName,
            visitedAt: new Date().toISOString(),
          };
          updated = [entry, ...prev];
        }

        try {
          localStorage.setItem(VISITED_PLACES_KEY, JSON.stringify(updated));
        } catch (e) {
          console.warn('Error saving visitedPlaces to localStorage:', e);
        }
        return updated;
      });

      return markedAsVisited;
    },
    []
  );

  const removeVisitedPlace = useCallback((placeId: string, placeName?: string) => {
    const normalizedName = (placeName || '').toLowerCase().trim();
    setVisitedPlaces((prev) => {
      const updated = prev.filter(
        (vp) =>
          vp.id !== placeId &&
          !(normalizedName && vp.name.toLowerCase().trim() === normalizedName)
      );
      try {
        localStorage.setItem(VISITED_PLACES_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Error removing visitedPlace from localStorage:', e);
      }
      return updated;
    });
  }, []);

  const clearVisitedPlaces = useCallback(() => {
    setVisitedPlaces([]);
    try {
      localStorage.removeItem(VISITED_PLACES_KEY);
    } catch (e) {
      console.warn('Error clearing visitedPlaces in localStorage:', e);
    }
  }, []);

  const toggleManualRestriction = useCallback((restriction: string) => {
    setUserTasteProfile((prev) => {
      const exists = prev.manualRestrictions.includes(restriction);
      const manualRestrictions = exists
        ? prev.manualRestrictions.filter((r) => r !== restriction)
        : [...prev.manualRestrictions, restriction];

      const summary = buildTasteProfileSummary({
        preferredCategories: prev.preferredCategories,
        preferredMoods: prev.preferredMoods,
        averageEnergy: prev.averageEnergy,
        recurringPreferences: prev.recurringPreferences,
        manualRestrictions,
        totalInteractions: prev.totalInteractions,
      });

      const nextProfile: UserTasteProfile = {
        ...prev,
        manualRestrictions,
        summary,
        lastUpdated: new Date().toISOString(),
      };

      try {
        localStorage.setItem(TASTE_PROFILE_KEY, JSON.stringify(nextProfile));
      } catch (e) {
        console.warn('Error saving manual restrictions to userTasteProfile:', e);
      }

      return nextProfile;
    });
  }, []);

  const resetTasteProfile = useCallback(() => {
    const fresh: UserTasteProfile = {
      ...defaultTasteProfile,
      lastUpdated: new Date().toISOString(),
    };
    setUserTasteProfile(fresh);
    try {
      localStorage.removeItem(TASTE_PROFILE_KEY);
    } catch (e) {
      console.warn('Error clearing userTasteProfile:', e);
    }
  }, []);

  const savePlan = useCallback(
    (plan: ProposalPlan) => {
      setSavedPlans((prev) => {
        // Evitar duplicados exactos
        if (prev.some((p) => p.plan.id === plan.id && p.plan.title === plan.title)) {
          return prev;
        }
        const newEntry: SavedExperience = {
          id: `${plan.id}-${Date.now()}`,
          savedAt: new Date().toISOString(),
          plan,
          moodLabel: state.formState.mood?.label,
          cityContext: state.searchCriteria?.environment || 'Experiencia Local',
        };
        const updated = [newEntry, ...prev];
        try {
          localStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(updated));
        } catch (e) {
          console.warn('Error saving plan to localStorage:', e);
        }
        return updated;
      });

      // Reforzar Mood Intelligence con mayor ponderación al guardar
      recordAffinities({
        environment: state.searchCriteria?.environment || state.formState.entorno?.label,
        moodLabel: state.searchCriteria?.user_mood || state.formState.mood?.label,
        intensity: state.searchCriteria?.intensity || state.formState.intensity,
        budget: state.searchCriteria?.budget,
        company: state.searchCriteria?.company || state.formState.company?.label,
        isFavoriteSave: true,
      });
    },
    [state.formState, state.searchCriteria, recordAffinities]
  );

  const removeSavedPlan = useCallback((planId: string) => {
    setSavedPlans((prev) => {
      const updated = prev.filter((p) => p.id !== planId && p.plan.id !== planId);
      try {
        localStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Error saving plan to localStorage:', e);
      }
      return updated;
    });

    setUserAffinities((prev) => {
      const updated = {
        ...prev,
        totalSavedExperiences: Math.max(0, prev.totalSavedExperiences - 1),
      };
      try {
        localStorage.setItem(AFFINITIES_KEY, JSON.stringify(updated));
      } catch (e) {
        console.warn('Error updating affinities on plan removal:', e);
      }
      return updated;
    });
  }, []);

  const clearSavedPlans = useCallback(() => {
    setSavedPlans([]);
    try {
      localStorage.removeItem(SAVED_PLANS_KEY);
    } catch (e) {
      console.warn('Error clearing saved plans in localStorage:', e);
    }
  }, []);

  const isPlanSaved = useCallback(
    (planId: string) => {
      return savedPlans.some((p) => p.plan.id === planId || p.id === planId);
    },
    [savedPlans]
  );

  const openSavedPlan = useCallback((saved: SavedExperience) => {
    setIsSavedPlansModalOpen(false);
    setState((prev) => ({
      ...prev,
      page: 'itinerary',
      itinerary: {
        proposals: [saved.plan],
        selectedProposalId: saved.plan.id,
        mainPlan: saved.plan,
      },
      error: null,
    }));
  }, []);

  const setUserLocation = (location: UserLocation | null) => {
    if (location) {
      saveLastLocation(location);
    }
    setState((prevState) => ({ ...prevState, userLocation: location }));
  };

  const setFormState = (newState: Partial<FormState>) => {
    setState((prevState) => ({
      ...prevState,
      formState: { ...prevState.formState, ...newState },
    }));
  };

  const handleGenerateItinerary = useCallback(
    async (criteria: SearchCriteria) => {
      const targetLocation = criteria.location || state.userLocation;
      if (!targetLocation) {
        setState((prevState) => ({
          ...prevState,
          error: 'La ubicación no está definida. Por favor, selecciona una ubicación o municipio.',
        }));
        return;
      }

      // Preparar hora local dinámica y preferencias históricas (Mood Intelligence)
      const now = new Date();
      const currentHour = now.getHours();
      const localTime = criteria.localTime || `${String(currentHour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // Ordenar top entornos y estados de ánimo según historial
      const topEnvironments = Object.entries(userAffinities.favoriteEnvironments)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

      const topMoods = Object.entries(userAffinities.favoriteMoods)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);

      const preferredIntensity = userAffinities.averageIntensity || criteria.intensity;

      const summaryParts = [
        topEnvironments.length > 0 ? `Entornos: ${topEnvironments.join(', ')}` : null,
        `Ritmo habitual: ${preferredIntensity.toFixed(1)}/10`,
        userAffinities.preferredBudget ? `Presupuesto: ${userAffinities.preferredBudget}` : null,
        userAffinities.totalSavedExperiences > 0 ? `${userAffinities.totalSavedExperiences} planes guardados` : null,
      ].filter(Boolean);

      const isGpsActive = Boolean(targetLocation.isGps || criteria.isGpsActive);
      const searchRadiusKm = criteria.searchRadiusKm || (criteria.environment === 'Escapada' ? 15 : 5);

      const enrichedCriteria: SearchCriteria = {
        ...criteria,
        location: targetLocation,
        cityName: targetLocation.cityName || criteria.cityName,
        localTime,
        isGpsActive,
        searchRadiusKm,
        latitude: targetLocation.lat,
        longitude: targetLocation.lng,
        experienceMode: criteria.experienceMode || state.formState.experienceMode || 'chained',
        onlyOpenNow: criteria.onlyOpenNow ?? state.formState.onlyOpenNow ?? false,
        userAffinities: {
          topEnvironments,
          topMoods,
          preferredIntensity,
          preferredBudget: userAffinities.preferredBudget,
          totalSearches: userAffinities.totalSearches,
          totalSavedExperiences: userAffinities.totalSavedExperiences,
          summaryNarrative: summaryParts.join(' • '),
        },
        visitedPlaces: visitedPlaces.map((vp) => ({ id: vp.id, name: vp.name })),
        userTasteProfile: {
          summary: userTasteProfile.summary,
          manualRestrictions: userTasteProfile.manualRestrictions,
          recurringPreferences: userTasteProfile.recurringPreferences,
          averageEnergy: userTasteProfile.averageEnergy,
        },
      };

      // Registrar preferencia en segundo plano para aprendizaje progresivo
      recordAffinities({
        environment: criteria.environment,
        moodLabel: criteria.user_mood,
        intensity: criteria.intensity,
        budget: criteria.budget,
        company: criteria.company,
      });

      setState((prevState) => ({
        ...prevState,
        searchCriteria: enrichedCriteria,
        userLocation: targetLocation,
        page: 'itinerary',
        isLoading: true,
        error: null,
        errorDetails: null,
        itinerary: null,
        weather: null,
        loadingMessage: criteria.isSurpriseMe
          ? '⚡ Sintonizando clima y hora local para tu sorpresa instantánea...'
          : 'Consultando condiciones meteorológicas de la zona',
      }));

      try {
        // Step 1: Gather real-world context with graceful weather degradation
        let weather: WeatherInfo | null = null;
        try {
          weather = await getWeather(targetLocation);
        } catch (weatherErr) {
          console.warn('Weather query failed, continuing with degraded state:', weatherErr);
          weather = {
            temp: null,
            condition: 'No disponible',
            description: 'Tiempo no disponible',
            icon: '⛅',
            alertLevel: 'unavailable',
            summary: 'Información meteorológica no disponible.',
            isAvailable: false,
          };
        }

        setState((prevState) => ({
          ...prevState,
          weather,
          loadingMessage: `Buscando lugares reales verificados (radio ${searchRadiusKm} km)`,
        }));

        // Step 2: Query verified places from Google Places / OpenStreetMap
        const eventQueries = getEventBasedSearchQueries(enrichedCriteria, weather);
        const places = await findPotentialPlaces(enrichedCriteria, eventQueries);

        // Step 3: Generate narrative itinerary with Gemini using ONLY verified places
        setState((prevState) => ({
          ...prevState,
          loadingMessage: enrichedCriteria.isSurpriseMe
            ? 'Creando propuesta única adaptada a tu momento'
            : 'Personalizando tu experiencia con lugares verificados',
        }));
        const baseItinerary = await generateItinerary({ criteria: enrichedCriteria, weather, places });

        // Step 4: Lock location data strictly to verified places
        const itineraryWithLocations = { ...baseItinerary };
        if (baseItinerary.proposals && Array.isArray(baseItinerary.proposals)) {
          itineraryWithLocations.proposals = baseItinerary.proposals
            .map((prop) => ({
              ...prop,
              schedule: enrichScheduleWithLocations(prop, places).schedule,
            }))
            .filter((prop) => prop.schedule.length > 0);
        }
        itineraryWithLocations.mainPlan = enrichScheduleWithLocations(
          baseItinerary.mainPlan,
          places
        );
        if (baseItinerary.premiumContingencyPlan) {
          itineraryWithLocations.premiumContingencyPlan = enrichScheduleWithLocations(
            baseItinerary.premiumContingencyPlan,
            places
          );
        }

        if (!itineraryWithLocations.mainPlan.schedule.length) {
          throw new ApiClientError({
            code: searchRadiusKm < 15 ? 'NO_VERIFIED_PLACES_IN_RADIUS' : 'NO_VERIFIED_PLACES',
            message:
              searchRadiusKm < 15
                ? `No encontramos suficientes lugares verificados en un radio de ${searchRadiusKm} km. Prueba ampliar el radio a 15 km.`
                : 'No encontramos lugares reales verificados suficientes en esta zona.',
            status: 404,
            retryable: false,
            suggestedRadiusKm: searchRadiusKm < 15 ? 15 : undefined,
          });
        }

        // Step 5: Enrich with routing information
        setState((prevState) => ({
          ...prevState,
          loadingMessage: 'Diseñando la ruta perfecta',
        }));
        const mobilityPreference =
          MOBILITY_OPTIONS.find((m) => m.label === enrichedCriteria.mobility) || MOBILITY_OPTIONS[0];
        const finalItinerary = await enrichItineraryWithRoutes(
          itineraryWithLocations,
          mobilityPreference.googleMode,
          weather
        );

        setState((prevState) => ({ ...prevState, itinerary: finalItinerary }));
      } catch (err) {
        console.error(err);
        if (err instanceof ApiClientError) {
          setState((prevState) => ({
            ...prevState,
            error: err.message,
            errorDetails: err.toStructured(),
          }));
        } else {
          setState((prevState) => ({
            ...prevState,
            error: 'No pudimos completar tu itinerario en este momento. Inténtalo de nuevo en unos instantes.',
            errorDetails: {
              code: 'INTERNAL_ERROR',
              message: 'No pudimos completar tu itinerario en este momento. Inténtalo de nuevo en unos instantes.',
              retryable: true,
            },
          }));
        }
      } finally {
        setState((prevState) => ({ ...prevState, isLoading: false, loadingMessage: '' }));
      }
    },
    [state.userLocation, state.formState.experienceMode, state.formState.onlyOpenNow, userAffinities, visitedPlaces, userTasteProfile, recordAffinities]
  );

  const handleExpandSearchRadius = useCallback(
    async (newRadiusKm = 15) => {
      if (!state.searchCriteria) return;
      await handleGenerateItinerary({
        ...state.searchCriteria,
        searchRadiusKm: newRadiusKm,
        allowSurroundings: true,
      });
    },
    [state.searchCriteria, handleGenerateItinerary]
  );

  const handleRetryLastSearch = useCallback(async () => {
    if (!state.searchCriteria) return;
    await handleGenerateItinerary(state.searchCriteria);
  }, [state.searchCriteria, handleGenerateItinerary]);

  // Botón directo "Sorpréndeme Ahora" (1-Tap)
  const handleSurpriseMe = useCallback(
    async (locationOverride?: UserLocation) => {
      const loc = locationOverride || state.userLocation || { lat: 40.4168, lng: -3.7038 };
      const currentHour = new Date().getHours();

      // Selección inteligente de entorno según la hora del día y afinidades
      let autoEnvironment = 'Urbano';
      if (currentHour >= 6 && currentHour < 12) {
        autoEnvironment = 'Cultural';
      } else if (currentHour >= 12 && currentHour < 16) {
        autoEnvironment = 'Gastronómico';
      } else if (currentHour >= 16 && currentHour < 20) {
        autoEnvironment = 'Urbano';
      } else {
        autoEnvironment = 'Noche';
      }

      // Si el usuario tiene un entorno favorito con más de 3 usos, respetarlo
      const topEnvs = Object.entries(userAffinities.favoriteEnvironments)
        .sort((a, b) => b[1] - a[1]);
      if (topEnvs.length > 0 && topEnvs[0][1] >= 3) {
        autoEnvironment = topEnvs[0][0];
      }

      const matchingEntorno = ENTORNO_OPTIONS.find((e) => e.label === autoEnvironment) || ENTORNO_OPTIONS[0];

      const surpriseCriteria: SearchCriteria = {
        user_mood: 'Quiero sorprenderme',
        user_mood_description: 'Propuesta espontánea 1-Tap adaptada al clima y momento exacto del día.',
        environment: autoEnvironment,
        company: 'En solitario',
        mobility: 'A pie',
        location: loc,
        cityName: loc.cityName,
        isGpsActive: Boolean(loc.isGps),
        searchRadiusKm: 5,
        latitude: loc.lat,
        longitude: loc.lng,
        intensity: 6,
        budget: '€€ Normal',
        isSurpriseMe: true,
      };

      // Actualizar formState para que coincida si el usuario vuelve
      setFormState({
        mood: { label: 'Curioso', icon: '✨' },
        entorno: matchingEntorno,
        intensity: 6,
      });

      await handleGenerateItinerary(surpriseCriteria);
    },
    [state.userLocation, userAffinities, handleGenerateItinerary]
  );

  const handleStartGroupMode = useCallback(
    async (locationOverride?: UserLocation, radiusOverride?: number) => {
      const targetLocation = locationOverride || state.userLocation;
      if (!targetLocation) {
        const msg = 'Selecciona primero una ubicación para crear el mazo de 5 planes.';
        setGroupError(msg);
        setGroupErrorDetails({ code: 'INVALID_REQUEST', message: msg, retryable: false });
        return;
      }

      const radiusKm =
        radiusOverride || (state.formState.entorno?.label === 'Escapada' ? 15 : 5);

      setIncomingGroupSession(null);
      setGroupError(null);
      setGroupErrorDetails(null);
      setGroupLoading(true);
      setGroupDeck([]);
      setGroupDeckCity(targetLocation.cityName || 'tu ciudad');
      setState((prev) => ({
        ...prev,
        page: 'group',
        error: null,
        errorDetails: null,
      }));

      try {
        const result = await generateGroupDeckProxy({
          location: targetLocation,
          cityName: targetLocation.cityName,
          mood: state.formState.mood?.label,
          environment: state.formState.entorno?.label,
          budget: state.formState.budget ? `${state.formState.budget.symbol} ${state.formState.budget.label}` : undefined,
          searchRadiusKm: radiusKm,
          onlyOpenNow: state.formState.onlyOpenNow,
          visitedPlaces: visitedPlaces.map((vp) => ({ id: vp.id, name: vp.name })),
          userTasteProfile: {
            summary: userTasteProfile.summary,
            manualRestrictions: userTasteProfile.manualRestrictions,
            recurringPreferences: userTasteProfile.recurringPreferences,
            averageEnergy: userTasteProfile.averageEnergy,
          },
        });
        setGroupDeck(result.deck);
        setGroupDeckCity(result.cityName || targetLocation.cityName || 'tu ciudad');
      } catch (err) {
        console.error('Error starting Group Mode:', err);
        if (err instanceof ApiClientError) {
          setGroupError(err.message);
          setGroupErrorDetails(err.toStructured());
        } else {
          const msg = 'No se pudo cargar el mazo de propuestas reales para decidir juntos.';
          setGroupError(msg);
          setGroupErrorDetails({ code: 'INTERNAL_ERROR', message: msg, retryable: true });
        }
      } finally {
        setGroupLoading(false);
      }
    },
    [state.userLocation, state.formState, visitedPlaces, userTasteProfile]
  );

  const handleExitGroupMode = useCallback(() => {
    setIncomingGroupSession(null);
    if (typeof window !== 'undefined' && window.location.search) {
      const url = new URL(window.location.href);
      if (url.searchParams.has('gs') || url.searchParams.has('g')) {
        url.searchParams.delete('gs');
        url.searchParams.delete('g');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    }
    setState((prevState) => ({
      ...prevState,
      page: prevState.userLocation ? 'home' : 'welcome',
      error: null,
    }));
  }, []);

  const handleBackToHome = () => {
    setState((prevState) => ({
      ...prevState,
      page: 'home',
      itinerary: null,
      searchCriteria: null,
      weather: null,
      error: null,
    }));
  };

  const value: AppContextType = {
    ...state,
    savedPlans,
    userAffinities,
    visitedPlaces,
    userTasteProfile,
    isSavedPlansModalOpen,
    setIsSavedPlansModalOpen,
    isPreferencesModalOpen,
    setIsPreferencesModalOpen,
    savePlan,
    removeSavedPlan,
    clearSavedPlans,
    isPlanSaved,
    openSavedPlan,
    toggleVisitedPlace,
    removeVisitedPlace,
    clearVisitedPlaces,
    isPlaceVisited,
    toggleManualRestriction,
    resetTasteProfile,
    setUserLocation,
    setFormState,
    handleGenerateItinerary,
    handleExpandSearchRadius,
    handleRetryLastSearch,
    handleSurpriseMe,
    handleBackToHome,
    groupDeck,
    groupDeckCity,
    groupLoading,
    groupError,
    groupErrorDetails,
    incomingGroupSession,
    handleStartGroupMode,
    handleExitGroupMode,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
