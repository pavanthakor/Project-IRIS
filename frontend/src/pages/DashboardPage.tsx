import { useState } from 'react';
import { IoCInput } from '@/components/IoCInput';
import { ThreatProfilePanel } from '@/components/ThreatProfilePanel';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import { QueryHistory } from '@/components/QueryHistory';
import { useIoCQuery } from '@/hooks/useQuery';
import type { IoCType } from '@/types';
import * as api from '@/services/api';

export default function DashboardPage() {
  const { data, loading, error, submitQuery } = useIoCQuery();
  const [historyKey, setHistoryKey] = useState(0);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [displayProfile, setDisplayProfile] = useState(data);

  async function handleSubmit(ioc: string, type: IoCType) {
    setActiveHistoryId(null);
    await submitQuery(ioc, type);
    setHistoryKey(k => k + 1);
  }

  async function handleHistorySelect(id: string) {
    setActiveHistoryId(id);
    try {
      const profile = await api.getQueryById(id);
      setDisplayProfile(profile);
    } catch {
      setDisplayProfile(null);
      setActiveHistoryId(null);
    }
  }

  const profile = activeHistoryId ? displayProfile : data;

  return (
    <div className="flex flex-col lg:flex-row min-h-0 flex-1 overflow-hidden">
      <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
        <IoCInput onSubmit={handleSubmit} loading={loading} />

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {loading && <LoadingState />}

        {!loading && profile && <ThreatProfilePanel profile={profile} />}

        {!loading && !profile && !error && <EmptyState />}
      </main>

      <aside className="w-full lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-slate-700 overflow-y-auto">
        <QueryHistory
          key={historyKey}
          onSelectQuery={handleHistorySelect}
          activeId={activeHistoryId}
        />
      </aside>
    </div>
  );
}
