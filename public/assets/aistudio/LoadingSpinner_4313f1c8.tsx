import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-indigo-500"></div>
        <p className="text-indigo-600 font-semibold mt-4">
            {message || 'Cargando...'}
        </p>
    </div>
  );
};

export default LoadingSpinner;