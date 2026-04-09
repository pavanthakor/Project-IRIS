import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; errorId: string; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorId: '' };
  }
  static getDerivedStateFromError(): State {
    return { hasError: true, errorId: Math.random().toString(36).slice(2, 10) };
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <div className="bg-slate-800 border border-red-500/30 rounded-xl p-8 max-w-md text-center">
            <div className="text-red-400 text-4xl mb-4">⚠</div>
            <h2 className="text-xl font-bold text-slate-100 mb-2">Something went wrong</h2>
            <p className="text-slate-400 text-sm mb-4">Error ID: <span className="font-mono text-red-400">{this.state.errorId}</span></p>
            <button
              onClick={() => { this.setState({ hasError: false, errorId: '' }); window.location.reload(); }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Also export as default for backwards compatibility
export default ErrorBoundary;
