import { useState, useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginForm } from './components/LoginForm';
import { IoCInput } from './components/IoCInput';
import { ThreatProfilePanel } from './components/ThreatProfilePanel';
import { QueryHistory } from './components/QueryHistory';
import { LoadingState } from './components/LoadingState';
import { EmptyState } from './components/EmptyState';
import { useAuth } from './hooks/useAuth';
import { useIoCQuery } from './hooks/useQuery';
import * as api from './services/api';
import type { ThreatProfile, IoCType } from './types';

// ── Navbar ───────────────────────────────────────────────────────────────────

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L3 6.5V12c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V6.5L12 2zm-1 14l-4-4 1.41-1.41L11 13.17l6.59-6.58L19 8l-8 8z"/>
    </svg>
  );
}

function tierBadge(tier: string) {
  if (tier === 'enterprise') return 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
  if (tier === 'pro') return 'bg-blue-500/20 text-blue-300 border border-blue-500/30';
  return 'bg-slate-600/40 text-slate-400 border border-slate-600/50';
}

interface NavbarProps {
  email: string;
  tier: string;
  onLogout: () => void;
}

function Navbar({ email, tier, onLogout }: NavbarProps) {
  return (
    <nav className="bg-slate-800 border-b border-slate-700 h-16 px-6 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <ShieldIcon className="w-7 h-7 text-blue-400" />
        <span className="text-xl font-bold font-mono tracking-wider text-slate-100">
          ThreatIntel
        </span>
        <span className="hidden sm:block text-xs text-slate-500 font-mono border border-slate-700 px-2 py-0.5 rounded">
          IRIS
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden sm:block text-sm text-slate-400 font-mono">{email}</span>
        <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${tierBadge(tier)}`}>
          {tier}
        </span>
        <button
          onClick={onLogout}
          className="text-sm text-red-400 hover:text-red-300 transition-colors font-medium"
        >
          Logout
        </button>
      </div>
    </nav>
  );
}

// ── Global error banner ───────────────────────────────────────────────────────

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-sm">
      <span>⚠ {message}</span>
      <button onClick={onDismiss} className="ml-4 hover:text-red-200 text-lg leading-none">×</button>
    </div>
  );
}

// ── Main AppContent ───────────────────────────────────────────────────────────

function AppContent() {
  const { user, loading: authLoading, logout, isAuthenticated } = useAuth();
  const { data, loading: queryLoading, error: queryError, submitQuery } = useIoCQuery();
  const [displayProfile, setDisplayProfile] = useState<ThreatProfile | null>(null);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    if (data) {
      setDisplayProfile(data);
      setActiveHistoryId(null);
    }
  }, [data]);

  useEffect(() => {
    if (queryError) {
      setGlobalError(queryError);
      const t = setTimeout(() => setGlobalError(null), 6000);
      return () => clearTimeout(t);
    }
  }, [queryError]);

  async function handleHistorySelect(id: string) {
    setActiveHistoryId(id);
    try {
      const profile = await api.getQueryById(id);
      setDisplayProfile(profile);
    } catch (err) {
      setGlobalError(api.getErrorMessage(err));
      setActiveHistoryId(null);
    }
  }

  async function handleSubmit(ioc: string, type: IoCType) {
    setActiveHistoryId(null);
    await submitQuery(ioc, type);
    setHistoryKey(k => k + 1);
  }

  // Auth loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <ShieldIcon className="w-12 h-12 text-blue-400 animate-pulse" />
          <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <LoginForm />;

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <Navbar email={user!.email} tier={user!.tier} onLogout={logout} />

      {globalError && (
        <ErrorBanner message={globalError} onDismiss={() => setGlobalError(null)} />
      )}

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* ── Main content (75%) ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
          <IoCInput onSubmit={handleSubmit} loading={queryLoading} />

          {queryLoading && <LoadingState />}

          {!queryLoading && displayProfile && (
            <ThreatProfilePanel profile={displayProfile} />
          )}

          {!queryLoading && !displayProfile && !queryError && (
            <EmptyState />
          )}
        </main>

        {/* ── Sidebar (25%) ──────────────────────────────────────────────── */}
        <aside className="w-full lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-slate-700 overflow-y-auto">
          <QueryHistory
            key={historyKey}
            onSelectQuery={handleHistorySelect}
            activeId={activeHistoryId}
          />
        </aside>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
