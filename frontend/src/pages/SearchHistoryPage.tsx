import { useState, useEffect } from 'react';
import { getHistory, getQueryById } from '@/services/api';
import { ThreatProfilePanel } from '@/components/ThreatProfilePanel';
import { LoadingState } from '@/components/LoadingState';
import type { QueryHistoryItem, ThreatProfile, RiskLevel } from '@/types';

const RISK_COLORS: Record<RiskLevel, string> = {
  CRITICAL: 'text-red-400 bg-red-900/30 border-red-700',
  HIGH:     'text-orange-400 bg-orange-900/30 border-orange-700',
  MEDIUM:   'text-yellow-400 bg-yellow-900/30 border-yellow-700',
  LOW:      'text-green-400 bg-green-900/30 border-green-700',
  NONE:     'text-slate-400 bg-slate-800 border-slate-600',
  UNKNOWN:  'text-slate-400 bg-slate-800 border-slate-600',
};

export default function SearchHistoryPage() {
  const [items, setItems] = useState<QueryHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ThreatProfile | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const pageSize = 20;

  useEffect(() => {
    setLoading(true);
    setError(null);
    getHistory(page, pageSize)
      .then(res => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => setError('Failed to load history.'))
      .finally(() => setLoading(false));
  }, [page]);

  async function handleSelect(id: string) {
    setDetailLoading(true);
    try {
      const profile = await getQueryById(id);
      setSelected(profile);
    } catch {
      setError('Failed to load query details.');
    } finally {
      setDetailLoading(false);
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Search History</h1>
        <p className="text-slate-400 text-sm mt-1">{total} queries recorded</p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-2">
            {items.length === 0 ? (
              <div className="text-center text-slate-500 py-16">No history yet. Run a query from the Dashboard.</div>
            ) : (
              items.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  className="w-full text-left bg-slate-800 hover:bg-slate-700/80 border border-slate-700 rounded-lg px-4 py-3 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-sm text-slate-100 truncate">{item.iocValue}</span>
                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded border ${RISK_COLORS[item.riskLevel ?? 'UNKNOWN']}`}>
                      {item.riskLevel ?? 'UNKNOWN'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-500 uppercase">{item.iocType}</span>
                    <span className="text-xs text-slate-600">·</span>
                    <span className="text-xs text-slate-500">{new Date(item.queriedAt).toLocaleString()}</span>
                  </div>
                </button>
              ))
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded text-slate-300"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-400">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 rounded text-slate-300"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          <div>
            {detailLoading && <LoadingState />}
            {!detailLoading && selected && <ThreatProfilePanel profile={selected} />}
            {!detailLoading && !selected && (
              <div className="text-center text-slate-600 py-16 border border-dashed border-slate-700 rounded-xl">
                Select a query to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
