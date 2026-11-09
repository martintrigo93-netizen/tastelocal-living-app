import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-red-50 text-red-800">
            <i className="fas fa-bomb text-5xl mb-4 text-red-500"></i>
            <h2 className="text-2xl font-bold mb-2">¡Ups! Algo ha ido muy mal.</h2>
            <p className="max-w-md">
                Ha ocurrido un error inesperado en la aplicación. Puedes intentar recargar la página.
            </p>
            <button
                onClick={this.handleReload}
                className="mt-6 py-2 px-6 bg-red-600 text-white font-bold rounded-lg shadow-md hover:bg-red-700 transition-colors"
            >
                Recargar Página
            </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;