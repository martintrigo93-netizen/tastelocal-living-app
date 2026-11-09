import React from 'react';

interface LoadingStateProps {
  currentStep: string;
}

const STEPS = [
  'Interpretando tu estado de ánimo',
  'Consultando lugares reales y verificados',
  'Diseñando tus 3 propuestas personalizadas',
  'Optimizando itinerarios y accesibilidad',
  '¡Tus planes están listos!',
];

const LoadingState: React.FC<LoadingStateProps> = ({ currentStep }) => {
  const currentStepIndex = STEPS.findIndex((s) => s.toLowerCase().includes(currentStep.toLowerCase())) !== -1
    ? STEPS.findIndex((s) => s.toLowerCase().includes(currentStep.toLowerCase()))
    : 1;

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-[#0F1015] text-white animate-fade-in select-none">
      {/* Halo visual */}
      <div className="w-20 h-20 rounded-full bg-[#FF5E2B]/10 border border-[#FF5E2B]/30 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(255,94,43,0.25)]">
        <div className="w-10 h-10 border-3 border-[#FF5E2B]/30 border-t-[#FF5E2B] rounded-full animate-spin"></div>
      </div>

      <h2 className="text-xl font-black text-white tracking-tight mb-2">
        Interpretando tu estado de ánimo...
      </h2>
      <p className="text-xs text-gray-400 max-w-xs mb-8">
        Conectando tu energía con lugares reales verificados en la ciudad
      </p>

      <div className="w-full max-w-xs space-y-3.5 bg-white/[0.03] p-5 rounded-2xl border border-white/10 text-left backdrop-blur-md">
        {STEPS.map((step, index) => {
          const isCompleted = currentStepIndex > index;
          const isCurrent = currentStepIndex === index;

          return (
            <div key={step} className="flex items-center gap-3">
              <div className="flex items-center justify-center w-5 h-5 flex-shrink-0">
                {isCompleted ? (
                  <span className="w-4 h-4 rounded-full bg-[#FF5E2B] text-white flex items-center justify-center text-[10px] font-bold">
                    ✓
                  </span>
                ) : isCurrent ? (
                  <div className="w-4 h-4 border-2 border-[#FF5E2B] border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span className="w-3.5 h-3.5 rounded-full border border-white/20"></span>
                )}
              </div>
              <span
                className={`text-xs font-medium tracking-wide ${
                  isCompleted
                    ? 'text-gray-500 line-through'
                    : isCurrent
                    ? 'text-[#FF5E2B] font-bold'
                    : 'text-gray-400'
                }`}
              >
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
