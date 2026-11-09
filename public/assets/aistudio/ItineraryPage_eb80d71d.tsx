import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import LoadingState from './LoadingState';
import MapComponent from './Map';
import { type PlanDetails, type ScheduleItem, type PremiumContingencyPlan, type RouteInfo, type WeatherInfo } from '../types';
import { type MobilityOption } from '../constants';

type ItineraryView = 'list' | 'map';

const getTravelIcon = (travelMode: MobilityOption['googleMode']) => {
    switch (travelMode) {
        case 'WALKING': return 'fas fa-walking';
        case 'TRANSIT': return 'fas fa-bus-alt';
        case 'DRIVING': return 'fas fa-car-side';
        case 'BICYCLING': return 'fas fa-bicycle';
        default: return 'fas fa-route';
    }
};

const AlertBadge: React.FC<{ icon: string, text: string, color: 'yellow' | 'blue' }> = ({ icon, text, color }) => {
    const colors = {
        yellow: 'bg-yellow-100 text-yellow-800',
        blue: 'bg-blue-100 text-blue-800',
    };
    return (
        <div className={`flex items-center text-xs font-semibold px-2.5 py-1 rounded-full ${colors[color]}`}>
            <i className={`${icon} mr-2`}></i>
            {text}
        </div>
    );
};

const RouteSegment: React.FC<{ route: RouteInfo, index: number }> = ({ route, index }) => (
    <div className="relative pl-8 pb-8 animate-fade-in-stagger" style={{ animationDelay: `${index * 150}ms`}}>
         {/* Línea de tiempo vertical punteada para la ruta */}
        <div className="absolute left-[2px] top-0 bottom-0 w-0 border-l-2 border-dashed border-gray-300"></div>
        
        <div className="ml-[-2px] flex flex-col space-y-3">
             <div className="flex items-center text-sm font-semibold text-gray-700">
                <div className="flex items-center justify-center w-6 h-6 bg-gray-200 rounded-full mr-3 z-10">
                    <i className={`${getTravelIcon(route.travelMode)} text-gray-600`}></i>
                </div>
                <span>{route.duration}</span>
                <span className="mx-2 text-gray-400 font-normal">•</span>
                <span>{route.distance}</span>
            </div>
            
            <div className="pl-9 flex flex-wrap gap-2">
                {route.trafficAlert && <AlertBadge icon="fas fa-traffic-light" text={route.trafficAlert} color="yellow" />}
                {route.weatherAlert && <AlertBadge icon="fas fa-cloud-showers-heavy" text={route.weatherAlert} color="blue" />}
            </div>

            {route.suggestedPois.length > 0 && (
                <div className="pl-9 pt-2">
                    <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Joyas por el camino</h5>
                    <div className="mt-2 space-y-1">
                        {route.suggestedPois.map(poi => (
                            <div key={poi.name} className="flex items-center text-sm text-gray-600">
                                <i className="fas fa-gem text-indigo-400 w-4 text-center mr-2"></i>
                                <span>{poi.name} <span className="text-gray-400">({poi.type})</span></span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    </div>
);


const ScheduleItemCard: React.FC<{ item: ScheduleItem, isFirst: boolean, index: number }> = ({ item, isFirst, index }) => (
    <div className="relative pl-8 animate-fade-in-stagger" style={{ animationDelay: `${index * 150}ms`}}>
        {/* Línea de tiempo vertical sólida para la actividad */}
        <div className={`absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-200 ${isFirst ? 'top-4' : ''}`}></div>
        {/* Círculo de la línea de tiempo */}
        <div className="absolute left-[-9px] top-4 w-5 h-5 bg-white border-4 border-indigo-500 rounded-full"></div>

        <div className="pb-8">
            <p className="text-sm font-bold text-indigo-600">{item.time}</p>
            <h4 className="text-lg font-semibold text-gray-800 mt-1">{item.activity}</h4>
            <div className="mt-2 text-sm text-gray-600">
                <p className="font-medium">{item.placeName}</p>
                <a 
                    href={`https://www.google.com/maps/search/?api=1&query_place_id=${item.placeId}`}
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-indigo-500 hover:underline flex items-center mt-1"
                >
                    <i className="fas fa-map-marker-alt mr-2"></i>
                    {item.placeAddress}
                </a>
            </div>
        </div>
    </div>
);

const PremiumContingencyPlanDisplay: React.FC<{ plan: PremiumContingencyPlan }> = ({ plan }) => (
    <div className="mt-8 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-lg animate-fade-in">
        <div className="flex items-start">
             <i className="fas fa-cloud-sun-rain mr-4 text-2xl text-blue-700 mt-1"></i>
            <div>
                 <h3 className="font-bold text-blue-800">Un Plan B Premium, por si acaso</h3>
                 <p className="text-sm text-blue-700 mt-1 italic">"{plan.reasonForChange}"</p>
            </div>
        </div>
       
        <div className="mt-4 pl-2 border-l-2 border-blue-200 ml-3">
             <div className="p-4 md:p-6">
                <h3 className="text-2xl font-bold text-gray-800">{plan.title}</h3>
                <p className="mt-2 text-gray-600">{plan.shortDescription}</p>
                <div className="mt-6">
                    {plan.schedule.map((item, index) => (
                        <ScheduleItemCard 
                            key={index}
                            item={item} 
                            isFirst={index === 0}
                            index={plan.schedule.length + index}
                        />
                    ))}
                </div>
            </div>
        </div>
    </div>
);

const WeatherAlert: React.FC<{ weather: WeatherInfo }> = ({ weather }) => {
    if (weather.alertLevel === 'clear') return null;

    const alertConfig = {
        warning: { icon: 'fa-exclamation-triangle', color: 'yellow', title: 'Aviso Meteorológico' },
        severe: { icon: 'fa-cloud-showers-heavy', color: 'red', title: 'Alerta Meteorológica Grave' }
    };
    const config = alertConfig[weather.alertLevel];

    return (
        <div className={`p-4 mb-6 border-l-4 rounded-r-lg bg-${config.color}-50 border-${config.color}-400 animate-fade-in`}>
            <div className="flex">
                <div className="flex-shrink-0">
                    <i className={`fas ${config.icon} text-${config.color}-500 text-xl`}></i>
                </div>
                <div className="ml-3">
                    <p className={`text-sm font-bold text-${config.color}-800`}>{config.title}</p>
                    <p className={`text-sm text-${config.color}-700 mt-1`}>{weather.summary}</p>
                </div>
            </div>
        </div>
    );
};

const ItineraryPage: React.FC = () => {
  const { itinerary, weather, isLoading, loadingMessage, error, handleBackToHome } = useAppContext();
  const [view, setView] = useState<ItineraryView>('list');
  const [feedback, setFeedback] = useState<'none' | 'liked' | 'disliked'>('none');

  const renderContent = () => {
    if (isLoading) return <LoadingState currentStep={loadingMessage} />;
    
    if (error) return (
      <div className="text-center p-8 flex flex-col justify-center items-center h-full">
        <i className="fas fa-exclamation-circle text-5xl text-red-500 mb-4"></i>
        <h3 className="font-semibold text-xl text-red-700">¡Oh, no! Algo salió mal</h3>
        <p className="text-gray-600 mt-2 max-w-sm">{error}</p>
        <button
          onClick={handleBackToHome}
          className="mt-6 py-2 px-6 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 transition-colors"
        >
          Volver a intentarlo
        </button>
      </div>
    );

    if (!itinerary || !weather) return (
        <div className="text-center p-8 flex flex-col justify-center items-center h-full text-gray-500">
            <i className="fas fa-map-signs text-5xl mb-4"></i>
            <h3 className="font-semibold text-lg">No se pudo generar un itinerario</h3>
            <p className="mt-2 max-w-sm">No hemos podido construir un plan con las opciones seleccionadas. ¡Prueba con otra combinación!</p>
             <button
              onClick={handleBackToHome}
              className="mt-6 py-2 px-6 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 transition-colors"
            >
              Empezar de nuevo
            </button>
        </div>
    );

    const mainContent = (
      <>
        <div className="p-4 md:p-6">
            <header className="mb-6">
                {itinerary.isGeographicallyOptimized && (
                    <p className="text-xs font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full inline-flex items-center mb-2">
                        <i className="fas fa-route mr-2"></i>
                        Ruta optimizada
                    </p>
                )}
                 <h3 className="text-2xl font-bold text-gray-800">{itinerary.mainPlan.title}</h3>
                 <p className="mt-2 text-gray-600">{itinerary.mainPlan.shortDescription}</p>
            </header>

            <WeatherAlert weather={weather} />
            
            {view === 'list' && (
               <div className="border-t pt-6">
                  <div>
                      {itinerary.mainPlan.schedule.map((item, index) => (
                          <React.Fragment key={item.placeId + index}>
                              {item.routeInfo && <RouteSegment route={item.routeInfo} index={index * 2} />}
                              <ScheduleItemCard 
                                  item={item} 
                                  isFirst={index === 0}
                                  index={index * 2 + 1}
                              />
                          </React.Fragment>
                      ))}
                  </div>
                  {itinerary.premiumContingencyPlan && (
                      <PremiumContingencyPlanDisplay plan={itinerary.premiumContingencyPlan} />
                  )}

                   <footer className="mt-10 pt-6 border-t text-center">
                        <h4 className="font-semibold text-gray-700">¿Te ha gustado este plan?</h4>
                        <div className="flex justify-center gap-4 mt-3">
                            <button 
                                onClick={() => setFeedback('liked')}
                                className={`p-3 h-14 w-14 rounded-full transition-all duration-300 ${feedback === 'liked' ? 'bg-green-500 text-white scale-110 shadow-lg' : 'bg-gray-200 text-gray-600 hover:bg-green-100'}`}
                                aria-label="Me gusta este plan"
                            >
                                <i className="fas fa-thumbs-up text-2xl"></i>
                            </button>
                            <button
                                onClick={() => setFeedback('disliked')}
                                className={`p-3 h-14 w-14 rounded-full transition-all duration-300 ${feedback === 'disliked' ? 'bg-red-500 text-white scale-110 shadow-lg' : 'bg-gray-200 text-gray-600 hover:bg-red-100'}`}
                                aria-label="No me gusta este plan"
                            >
                                <i className="fas fa-thumbs-down text-2xl"></i>
                            </button>
                        </div>
                        {feedback !== 'none' && <p className="text-sm text-gray-500 mt-4 animate-fade-in">¡Gracias por tu feedback!</p>}
                    </footer>
              </div>
            )}
        </div>

        {view === 'map' && (
           <div className="flex-grow">
               <MapComponent schedule={itinerary.mainPlan.schedule} />
           </div>
        )}
      </>
    );

    return view === 'map' 
      ? <div className="flex flex-col h-full">{mainContent}</div> 
      : <div className="overflow-y-auto scrollbar-hide">{mainContent}</div>;
  };

  const ViewToggleButton: React.FC<{ currentView: ItineraryView, targetView: ItineraryView, icon: string, label: string }> = ({ currentView, targetView, icon, label }) => {
    const isActive = currentView === targetView;
    return (
        <button
            onClick={() => setView(targetView)}
            className={`p-2 rounded-md transition-colors ${isActive ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:bg-gray-100'}`}
            aria-label={label}
            title={label}
        >
            <i className={`fas ${icon} text-lg w-6`}></i>
        </button>
    );
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 animate-fade-in">
      <header className="p-3 border-b bg-white flex items-center justify-between shadow-sm z-10 sticky top-0">
        <button 
            onClick={handleBackToHome} 
            className="text-indigo-600 hover:text-indigo-800 transition p-2 rounded-md"
            aria-label="Volver"
            title="Volver"
        >
          <span aria-hidden="true" className="fas fa-arrow-left text-xl w-6"></span>
        </button>
        <div className="flex-grow text-center">
             {!isLoading && (
                <div className="p-1 bg-gray-200 rounded-lg inline-flex">
                   <ViewToggleButton currentView={view} targetView='list' icon="fa-list-ul" label="Vista de lista" />
                   <ViewToggleButton currentView={view} targetView='map' icon="fa-map-marked-alt" label="Vista de mapa" />
                </div>
             )}
        </div>
        <div className="w-10"></div> {/* Spacer to balance the back button */}
      </header>
      <main className="flex-grow overflow-hidden">
        {renderContent()}
      </main>
    </div>
  );
};

export default ItineraryPage;