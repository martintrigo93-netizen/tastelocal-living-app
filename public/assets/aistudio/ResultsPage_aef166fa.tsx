import React from 'react';

const ResultsPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-500">
      <i className="fas fa-code text-4xl mb-4"></i>
      <h2 className="text-xl font-bold">Componente Obsoleto</h2>
      <p className="max-w-md mt-2">
        Esta página de resultados ya no se utiliza en el flujo actual de la aplicación, que ha sido reemplazado por la vista de itinerario generada por IA.
      </p>
    </div>
  );
};

export default ResultsPage;
