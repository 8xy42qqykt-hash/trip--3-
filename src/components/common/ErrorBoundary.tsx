import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled app error:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // Ignore
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-black text-white text-center select-none">
          <div className="w-14 h-14 rounded-2xl bg-red-500/15 text-red-400 flex items-center justify-center mb-4 text-2xl font-bold">
            !
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">
            Something went wrong
          </h1>
          <p className="text-sm text-slate-400 max-w-xs mb-6">
            {this.state.error?.message || 'An unexpected error occurred while loading the app.'}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-full bg-white/10 text-white text-sm font-semibold cursor-pointer active:scale-95"
            >
              Reload Page
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="px-5 py-2.5 rounded-full bg-[#0A84FF] text-white text-sm font-semibold cursor-pointer active:scale-95"
            >
              Reset & Restart
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
