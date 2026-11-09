import React from 'react';

interface LoadingStateProps {
  currentStep: string;
}

const STEPS = [
  "Analizando el clima",
  "Buscando lugares de interés",
  "Consultando a la IA creativa",
  "Diseñando la ruta perfecta",
  "¡Listo!",
];

const LoadingState: React.FC<LoadingStateProps> = ({ currentStep }) => {
  const currentStepIndex = STEPS.indexOf(currentStep);

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 animate-fade-in">
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-indigo-500 mb-8"></div>
        <h2 className="text-xl font-bold text-indigo-600 mb-6">Creando tu experiencia...</h2>
        <div className="w-full max-w-xs space-y-4">
            {STEPS.map((step, index) => {
                const isCompleted = currentStepIndex > index;
                const isCurrent = currentStepIndex === index;

                return (
                    <div key={step} className="flex items-center text-left">
                        <div className="flex items-center justify-center w-6 h-6 mr-3">
                           {isCompleted ? (
                                <i className="fas fa-check-circle text-2xl text-green-500"></i>
                           ) : isCurrent ? (
                                <div className="w-5 h-5 border-2 border-dashed rounded-full animate-spin border-indigo-400"></div>
                           ) : (
                                <i className="far fa-circle text-2xl text-gray-300"></i>
                           )}
                        </div>
                        <span className={`font-semibold ${isCompleted ? 'text-gray-500 line-through' : isCurrent ? 'text-indigo-600' : 'text-gray-400'}`}>
                            {step}
                        </span>
                    </div>
                );
            })}
        </div>
    </div>
  );
};

export default LoadingState;