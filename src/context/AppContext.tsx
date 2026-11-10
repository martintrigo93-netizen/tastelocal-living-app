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
} from '../types';
import { generateItinerary } from '../services/geminiService';
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

export interface FormState {
  mood: Mood | null;
  moodDescription: string;
  entorno: EntornoOption | null;
  company: Company | null;
  budget: BudgetOption | null;
  mobility: MobilityOption | null;
  intensity: number;
  availableTime: '< 2h' | '2-4h' | 'Día completo';
}

export interface AppState {
  page: Page;
  itinerary: GeneratedItinerary | null;
  weather: WeatherInfo | null;
  searchCriteria: SearchCriteria | null;
  isLoading: boolean;
  loadingMessage: string;
  error: string | null;
  userLocation: UserLocation | null;
  formState: FormState;
}

export interface AppContextType extends AppState {
  savedPlans: SavedExperience[];
  userAffinities: UserAffinities;
  isSavedPlansModalOpen: boolean;
  setIsSavedPlansModalOpen: (open: boolean) => void;
  savePlan: (plan: ProposalPlan) => void;
  removeSavedPlan: (planId: string) => void;
  clearSavedPlans: () => void;
  isPlanSaved: (planId: string) => boolean;
  openSavedPlan: (saved: SavedExperience) => void;
  setUserLocation: (location: UserLocation | null) => void;
  setFormState: (newState: Partial<FormState>) => void;
  handleGenerateItinerary: (criteria: SearchCriteria) => Promise<void>;
  handleSurpriseMe: (locationOverride?: UserLocation) => Promise<void>;
  handleBackToHome: () => void;
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
};

// Helper strictly guaranteeing verified coordinates and addresses from Google Places
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
        // If the item already has valid location coordinates from the server, preserve it!
        if (item.location && typeof item.location.lat === 'number' && typeof item.location.lng === 'number') {
          return item;
        }
        return null;
      }

      return {
        ...item,
        placeId: matchedPlace.id,
        placeName: matchedPlace.name,
        placeAddress: matchedPlace.address || item.placeAddress,
        location: matchedPlace.location,
        rating: matchedPlace.rating ?? item.rating,
        phoneNumber: matchedPlace.phoneNumber || item.phoneNumber,
        websiteUri: matchedPlace.websiteUri || item.websiteUri,
        allowsDogs: matchedPlace.allowsDogs ?? item.allowsDogs,
        accessibilityOptions: matchedPlace.accessibilityOptions || item.accessibilityOptions,
      };
    })
    .filter((item): item is ScheduleItem => item !== null);

  // If filtering resulted in empty schedule but original had items with locations, fallback to original
  if (enrichedSchedule.length === 0 && planDetails.schedule.length > 0) {
    return planDetails;
  }

  return { ...planDetails, schedule: enrichedSchedule };
};

const SAVED_PLANS_KEY = 'tastelocal_saved_plans_v1';
const AFFINITIES_KEY = 'tastelocal_user_affinities_v1';

const defaultAffinities: UserAffinities = {
  favoriteEnvironments: {},
  favoriteMoods: {},
  favoriteIntensities: {},
  averageIntensity: 5.0,
  totalSearches: 0,
  totalSavedExperiences: 0,
  lastUpdated: new Date().toISOString(),
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

  const [state, setState] = useState<AppState>({
    page: 'home',
    itinerary: null,
    weather: null,
    searchCriteria: null,
    isLoading: false,
    loadingMessage: '',
    error: null,
    userLocation: null,
    formState: initialFormState,
  });

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
    },
    []
  );

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

      const enrichedCriteria: SearchCriteria = {
        ...criteria,
        location: targetLocation,
        localTime,
        userAffinities: {
          topEnvironments,
          topMoods,
          preferredIntensity,
          preferredBudget: userAffinities.preferredBudget,
          totalSearches: userAffinities.totalSearches,
          totalSavedExperiences: userAffinities.totalSavedExperiences,
          summaryNarrative: summaryParts.join(' • '),
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
          loadingMessage: 'Buscando lugares reales verificados',
        }));

        // Step 2: Query verified places from Google Places (or real POIs)
        let places: Plan[] = [];
        try {
          const eventQueries = getEventBasedSearchQueries(enrichedCriteria, weather);
          places = await findPotentialPlaces(enrichedCriteria, eventQueries);
        } catch (placeError) {
          console.error('Error al consultar lugares reales:', placeError);
        }

        // Step 3: Ensure places array is initialized for server-side synthesis
        if (!places) {
          places = [];
        }

        // Step 4: Generate narrative itinerary with Gemini using ONLY verified places
        setState((prevState) => ({
          ...prevState,
          loadingMessage: enrichedCriteria.isSurpriseMe
            ? 'Creando propuesta única adaptada a tu momento'
            : 'Creando tu plan personalizado con IA',
        }));
        const baseItinerary = await generateItinerary({ criteria: enrichedCriteria, weather, places });

        // Step 5: Lock location data strictly to verified places
        const itineraryWithLocations = { ...baseItinerary };
        if (baseItinerary.proposals && Array.isArray(baseItinerary.proposals)) {
          itineraryWithLocations.proposals = baseItinerary.proposals.map((prop) => ({
            ...prop,
            schedule: enrichScheduleWithLocations(prop, places).schedule,
          }));
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

        // Step 6: Enrich with routing information
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
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'No se pudo generar el itinerario. Por favor, inténtalo de nuevo.';
        setState((prevState) => ({ ...prevState, error: errorMessage }));
      } finally {
        setState((prevState) => ({ ...prevState, isLoading: false, loadingMessage: '' }));
      }
    },
    [state.userLocation, userAffinities, recordAffinities]
  );

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
    isSavedPlansModalOpen,
    setIsSavedPlansModalOpen,
    savePlan,
    removeSavedPlan,
    clearSavedPlans,
    isPlanSaved,
    openSavedPlan,
    setUserLocation,
    setFormState,
    handleGenerateItinerary,
    handleSurpriseMe,
    handleBackToHome,
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
