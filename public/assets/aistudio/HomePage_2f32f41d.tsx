import React, { useState } from 'react';
import { type Mood, type Entorno, type SearchCriteria, type Company, type Mobility } from '../types';
import { MOOD_OPTIONS, ENTORNO_OPTIONS, COMPANY_OPTIONS, MOBILITY_OPTIONS } from '../constants';
import { analyzeMoodFromText } from '../services/geminiService';
import { useAppContext } from '../context/AppContext';

const OptionCard: React.FC<{ icon: string, label: string, isSelected: boolean, onSelect: () => void, className?: string }> = ({ icon, label, isSelected, onSelect, className="" }) => {
  const selectionClasses = isSelected
    ? 'border-indigo-500 ring-2 ring-indigo-500 scale-105 shadow-lg bg-indigo-50'
    : 'border-gray-200 hover:border-indigo-300 hover:shadow-md bg-white';

  return (
    <div
      onClick={onSelect}
      className={`p-4 border rounded-xl text-center cursor-pointer transition-all duration-300 ${selectionClasses} ${className}`}
    >
      <div className="text-4xl mb-2">{icon}</div>
      <h3 className="font-bold text-gray-800 text-sm md:text-base">{label}</h3>
    </div>
  );
};

const Section: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <section className="w-full space-y-4">
        <h2 className="text-xl font-semibold text-gray-800 text-left">{title}</h2>
        {children}
    </section>
);


const HomePage: React.FC = () => {
  const { userLocation, handleGenerateItinerary, formState, setFormState } = useAppContext();
  const { mood: selectedMood, moodDescription, entorno: selectedEntorno, company: selectedCompany, mobility: selectedMobility, intensity } = formState;
  
  const [voiceInputStatus, setVoiceInputStatus] = useState<'idle' | 'listening' | 'processing' | 'error'>('idle');
  const [voiceConfirmation, setVoiceConfirmation] = useState<string>('');

  const handleManualMoodSelection = (mood: Mood) => {
    // Clear description when a mood is manually selected to avoid inconsistency
    setFormState({ mood, moodDescription: '' });
  };

  const handleListen = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceInputStatus('error');
      alert("Tu navegador no soporta la entrada por voz.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = false;

    recognition.onstart = () => {
      setVoiceInputStatus('listening');
      setVoiceConfirmation('');
    }
    
    recognition.onresult = async (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      setVoiceInputStatus('processing');
      try {
        const mood = await analyzeMoodFromText(transcript);
        // Combine state updates to prevent potential race conditions
        setFormState({ moodDescription: transcript, mood });
        setVoiceConfirmation('¡Entendido! He anotado tus detalles.');
        setTimeout(() => setVoiceConfirmation(''), 3000); // Clear after 3s
      } catch (err) {
        setVoiceInputStatus('error');
      } finally {
        // No se reinicia a 'idle' aquí para que el usuario vea el estado "Analizando..."
      }
    };
    
    recognition.onend = () => {
        // Asegura que siempre volvamos al estado 'idle' cuando la operación termine
        setVoiceInputStatus('idle');
    };
    
    recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setVoiceInputStatus('error');
        // También reinicia a 'idle' después de un error para permitir reintentos
        setTimeout(() => setVoiceInputStatus('idle'), 2000);
    };
    
    recognition.start();
  };

  const getVoiceButtonContent = () => {
    switch (voiceInputStatus) {
        case 'listening':
            return <><i className="fas fa-microphone-alt animate-pulse text-red-500"></i><span className="ml-2">Escuchando...</span></>;
        case 'processing':
            return <><i className="fas fa-spinner fa-spin"></i><span className="ml-2">Analizando...</span></>;
        case 'error':
            return <><i className="fas fa-exclamation-triangle text-red-500"></i><span className="ml-2">Error, intenta de nuevo</span></>;
        case 'idle':
        default:
            return <><i className="fas fa-microphone"></i><span className="ml-2">Prefiero decírtelo</span></>;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMood && selectedEntorno && selectedCompany && selectedMobility && userLocation) {
      const criteria: SearchCriteria = {
        user_mood: selectedMood.label,
        environment: selectedEntorno.label,
        company: selectedCompany.label,
        mobility: selectedMobility.label,
        location: {
          lat: userLocation.lat,
          lng: userLocation.lng,
        },
        intensity: intensity,
        ...(moodDescription.trim() && { user_mood_description: moodDescription.trim() }),
      };
      handleGenerateItinerary(criteria);
    }
  };
  
  const isSubmitDisabled = !selectedMood || !selectedEntorno || !selectedCompany || !selectedMobility || !userLocation;

  return (
    <div className="flex flex-col h-full bg-white animate-fade-in">
      <header className="p-6 text-center border-b">
        <h1 className="text-3xl font-bold text-indigo-600">TasteLocal Living</h1>
        <p className="text-gray-500">Tu planificador de día inteligente</p>
      </header>

      <main className="flex-grow overflow-y-auto p-6 space-y-8 scrollbar-hide">
        <Section title="¿Cómo te sientes hoy?">
            <div className="grid grid-cols-3 gap-3 w-full">
              {MOOD_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.label}
                  icon={opt.icon}
                  label={opt.label}
                  isSelected={selectedMood?.label === opt.label}
                  onSelect={() => handleManualMoodSelection(opt)}
                />
              ))}
            </div>
             <div className="w-full pt-2">
                <label htmlFor="mood-description" className="sr-only">Añade más detalles sobre tu estado de ánimo</label>
                <textarea
                    id="mood-description"
                    value={moodDescription}
                    onChange={(e) => setFormState({ moodDescription: e.target.value })}
                    placeholder="Si quieres, añade más detalles..."
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors text-sm"
                    rows={2}
                ></textarea>
            </div>
            <button 
              onClick={handleListen} 
              disabled={voiceInputStatus !== 'idle'}
              className="w-full mt-2 py-3 px-4 flex items-center justify-center bg-gray-100 text-gray-700 font-semibold rounded-lg shadow-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
              aria-label="Decir mi estado de ánimo por voz"
            >
              {getVoiceButtonContent()}
            </button>
            {voiceConfirmation && (
              <p className="text-sm text-green-600 font-semibold text-center mt-2 animate-fade-in">
                {voiceConfirmation}
              </p>
            )}
        </Section>
        
        <Section title="¿Qué entorno te apetece?">
            <div className="grid grid-cols-3 gap-3 w-full">
              {ENTORNO_OPTIONS.map(opt => (
                 <OptionCard
                  key={opt.label}
                  icon={opt.icon}
                  label={opt.label}
                  isSelected={selectedEntorno?.label === opt.label}
                  onSelect={() => setFormState({ entorno: opt })}
                />
              ))}
            </div>
        </Section>
        
        <Section title="¿Con quién vas?">
            <div className="grid grid-cols-2 gap-4 w-full">
              {COMPANY_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.label}
                  icon={opt.icon}
                  label={opt.label}
                  isSelected={selectedCompany?.label === opt.label}
                  onSelect={() => setFormState({ company: opt })}
                  className="aspect-[4/3] flex flex-col justify-center items-center"
                />
              ))}
            </div>
        </Section>

        <Section title="¿Preferencia de movilidad?">
             <div className="grid grid-cols-2 gap-4 w-full">
              {MOBILITY_OPTIONS.map(opt => (
                <OptionCard
                  key={opt.label}
                  icon={opt.icon}
                  label={opt.label}
                  isSelected={selectedMobility?.label === opt.label}
                  onSelect={() => setFormState({ mobility: opt })}
                  className="aspect-[4/3] flex flex-col justify-center items-center"
                />
              ))}
            </div>
        </Section>

        <Section title="¿Qué intensidad buscas?">
             <div className="w-full px-2 py-4">
              <label htmlFor="intensity" className="block mb-2 font-medium text-gray-700">
                Nivel de energía: <span className="font-bold text-indigo-600">{intensity} / 10</span>
              </label>
              <input
                id="intensity"
                type="range"
                min="1"
                max="10"
                value={intensity}
                onChange={(e) => setFormState({ intensity: Number(e.target.value) })}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                aria-label={`Intensidad del plan, valor actual ${intensity}`}
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1 font-semibold" aria-hidden="true">
                <span>Tranquilo</span>
                <span>Energético</span>
              </div>
            </div>
        </Section>

      </main>

      <footer className="p-6 border-t mt-auto bg-white">
         <form onSubmit={handleSubmit}>
             <button
                type="submit"
                disabled={isSubmitDisabled}
                className="w-full py-4 px-6 text-lg text-white font-bold rounded-lg shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all transform hover:scale-105 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:scale-100"
            >
                <i className="fas fa-magic mr-2"></i>
                Crear mi día perfecto
            </button>
        </form>
        <p className="text-xs text-gray-400 mt-3 text-center">Powered by Gemini & Google Maps</p>
      </footer>
    </div>
  );
};

export default HomePage;