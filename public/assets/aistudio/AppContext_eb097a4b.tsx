import React, { createContext, useState, useCallback, useContext, type ReactNode } from 'react';
import { type Page, type SearchCriteria, type UserLocation, type Mood, type Entorno, type Company, type GeneratedItinerary, type Plan, type PlanDetails, type ScheduleItem, WeatherInfo } from '../types';
import { generateItinerary } from '../services/geminiService';
import { findPotentialPlaces } from '../services/googleMapsService';
import { getEventBasedSearchQueries } from '../services/eventsService';
import { getWeather } from '../services/weatherService';
import { enrichItineraryWithRoutes } from '../services/routingService';
import { type MobilityOption, MOBILITY_OPTIONS, type EntornoOption } from '../constants';

interface FormState {
  mood: Mood | null;
  moodDescription: string;
  entorno: EntornoOption | null;
  company: Company | null;
  mobility: MobilityOption | null;
  intensity: number;
}

interface AppState {
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

interface AppContextType extends AppState {
  setUserLocation: (location: UserLocation) => void;
  setFormState: (newState: Partial<FormState>) => void;
  handleGenerateItinerary: (criteria: SearchCriteria) => Promise<void>;
  handleBackToHome: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

const initialFormState: FormState = {
    mood: null,
    moodDescription: '',
    entorno: null,
    company: null,
    // Robust default selection, not dependent on array order
    mobility: MOBILITY_OPTIONS.find(m => m.label === 'A pie') || null,
    intensity: 5,
};


// --- Helper para enriquecer el itinerario con datos de ubicación ---
const enrichScheduleWithLocations = <T extends PlanDetails>(planDetails: T, places: Plan[]): T => {
    if (!planDetails || !planDetails.schedule) return planDetails;
    
    const placesById = new Map(places.map(p => [p.id, p]));
    
    const enrichedSchedule = planDetails.schedule.map((item: ScheduleItem) => {
        const place = placesById.get(item.placeId);
        return {
            ...item,
            location: place ? place.location : undefined,
        };
    });

    return { ...planDetails, schedule: enrichedSchedule };
};


export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
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

  const setUserLocation = (location: UserLocation) => {
    setState(prevState => ({ ...prevState, userLocation: location }));
  };
  
  const setFormState = (newState: Partial<FormState>) => {
    setState(prevState => ({
      ...prevState,
      formState: { ...prevState.formState, ...newState },
    }));
  };

  const handleGenerateItinerary = useCallback(async (criteria: SearchCriteria) => {
    if (!state.userLocation) {
      setState(prevState => ({ ...prevState, error: "La ubicación del usuario no está definida." }));
      return;
    }
    
    setState(prevState => ({
      ...prevState,
      searchCriteria: criteria,
      page: 'itinerary',
      isLoading: true,
      error: null,
      itinerary: null,
      weather: null,
      loadingMessage: 'Analizando el clima',
    }));

    try {
      // Step 1: Gather real-world context (Weather)
      const weather = await getWeather(state.userLocation);
      setState(prevState => ({ ...prevState, weather, loadingMessage: 'Buscando lugares de interés' }));
      
      // Step 2: Find potential places (with improved resilience)
      let places: Plan[] = [];
      try {
        const eventQueries = getEventBasedSearchQueries(criteria, weather);
        places = await findPotentialPlaces(criteria, eventQueries);
      } catch (placeError) {
        console.error("Error crítico al buscar lugares con la API. Se procederá usando solo planes de respaldo.", placeError);
        // La variable 'places' se queda como un array vacío, el siguiente paso lo gestionará.
      }
      
      // Step 3: Use only places returned by Google Places.
      // Synthetic fallback coordinates must never be presented as real venues.
      if (places.length === 0) {
        throw new Error(
          'No se encontraron lugares reales para esta búsqueda. Comprueba la conexión y la configuración de Google Places e inténtalo de nuevo.'
        );
      }

      // Step 4: Generate the core itinerary with AI
      setState(prevState => ({ ...prevState, loadingMessage: 'Consultando a la IA creativa' }));
      const baseItinerary = await generateItinerary({ criteria, weather, places });

      // Step 5: Enrich with location data for the map
      let itineraryWithLocations = { ...baseItinerary };
      itineraryWithLocations.mainPlan = enrichScheduleWithLocations(baseItinerary.mainPlan, places);
      if (baseItinerary.premiumContingencyPlan) {
          itineraryWithLocations.premiumContingencyPlan = enrichScheduleWithLocations(baseItinerary.premiumContingencyPlan, places);
      }

      // Step 6: Enrich with routing information
      setState(prevState => ({ ...prevState, loadingMessage: 'Diseñando la ruta perfecta' }));
      const mobilityPreference = MOBILITY_OPTIONS.find(m => m.label === criteria.mobility) || MOBILITY_OPTIONS[0];
      const finalItinerary = await enrichItineraryWithRoutes(itineraryWithLocations, mobilityPreference.googleMode, weather);

      setState(prevState => ({ ...prevState, itinerary: finalItinerary }));

    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : 'No se pudo generar el itinerario. Por favor, inténtalo de nuevo.';
      setState(prevState => ({ ...prevState, error: errorMessage }));
    } finally {
      setState(prevState => ({ ...prevState, isLoading: false, loadingMessage: '' }));
    }
  }, [state.userLocation]);

  const handleBackToHome = () => {
    setState(prevState => ({
      ...prevState,
      page: 'home',
      itinerary: null,
      searchCriteria: null,
      weather: null,
      error: null,
    }));
  };

  const value = {
    ...state,
    setUserLocation,
    setFormState,
    handleGenerateItinerary,
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