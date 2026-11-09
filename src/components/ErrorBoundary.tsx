import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-[#0F1015] text-white animate-fade-in select-none">
          <div className="w-16 h-16 rounded-2xl bg-red-950/60 border border-red-500/40 text-red-400 flex items-center justify-center text-3xl mb-4 shadow-lg">
            ⚠️
          </div>
          <h2 className="text-xl md:text-2xl font-black mb-2 tracking-tight text-white">¡Ups! Algo no ha salido como esperábamos</h2>
          <p className="max-w-md text-xs md:text-sm text-gray-400 mb-6 leading-relaxed">
            Ha ocurrido un problema puntual al renderizar la experiencia. Puedes recargar la aplicación para volver al inicio.
          </p>
          <button
            onClick={this.handleReload}
            className="py-3 px-6 bg-[#FF5E2B] hover:bg-[#E84D1C] text-white font-bold text-xs rounded-xl shadow-[0_4px_16px_rgba(255,94,43,0.35)] transition cursor-pointer"
          >
            Recargar aplicación
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
