import { useState, useEffect } from 'react';
import * as api from '../services/api';
import type { QueryHistoryItem } from '../types';

interface Props {
  onSelectQuery: (id: string) => void;
  activeId?: string | null;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function riskColor(score: number | null): string {
  if (score == null) return 'text-slate-400';
  if (score >= 80) return 'text-red-400';
  if (score >= 60) return 'text-orange-400';
  if (score >= 40) return 'text-yellow-400';
  if (score >= 20) return 'text-green-400';
  return 'text-slate-400';
}

function typeBadge(type: QueryHistoryItem['iocType']): string {
  const m: Record<string, string> = {
    ip:     'bg-sky-500/20 text-sky-400',
    domain: 'bg-violet-500/20 text-violet-400',
    hash:   'bg-amber-500/20 text-amber-400',
    email:  'bg-emerald-500/20 text-emerald-400',
  };
  return m[type] ?? 'bg-slate-500/20 text-slate-400';
}

function SkeletonItem() {
  return (
    <div className="px-4 py-3 animate-pulse">
      <div className="h-3 bg-slate-700 rounded w-3/4 mb-2" />
      <div className="flex gap-2">
        <div className="h-3 bg-slate-700 rounded w-12" />
        <div className="h-3 bg-slate-700 rounded w-16" />
      </div>
    </div>
  );
}

export function QueryHistory({ onSelectQuery, activeId }: Props) {
  const [items, setItems] = useState<QueryHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadHistory(p: number, append = false) {
    setLoading(true);
    setError('');
    try {
      const result = await api.getHistory(p, 10);
      setItems(prev => append ? [...prev, ...result.items] : result.items);
      setTotal(result.total);
      setPage(p);
    } catch {
      setError('Failed to load history');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadHistory(1); }, []);

  return (
    <div className="bg-slate-800 h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">📜 Query History</span>
          {total > 0 && (
            <span className="bg-slate-700 text-slate-400 text-xs px-2 py-0.5 rounded-full">
              {total}
            </span>
          )}
        </div>
        <button
          onClick={() => loadHistory(1)}
          disabled={loading}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-700/40">
        {loading && items.length === 0 ? (
          <>
            <SkeletonItem />
            <SkeletonItem />
            <SkeletonItem />
            <SkeletonItem />
          </>
        ) : error ? (
          <div className="px-4 py-8 text-center">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => loadHistory(1)}
              className="mt-2 text-xs text-slate-400 hover:text-slate-200"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <span className="text-4xl text-slate-600 mb-3">🔍</span>
            <p className="text-slate-500 text-sm font-medium">No queries yet</p>
            <p className="text-slate-600 text-xs mt-1">Start by analyzing an IoC</p>
          </div>
        ) : (
          items.map(item => {
            const isActive = item.id === activeId;
            return (
              <button
                key={item.id}
                onClick={() => onSelectQuery(item.id)}
                className={`w-full text-left px-4 py-3 hover:bg-slate-700/50 transition-colors group ${
                  isActive ? 'bg-blue-500/10 border-l-2 border-blue-500' : 'border-l-2 border-transparent'
                }`}
              >
                {/* IoC value */}
                <p className={`font-mono text-sm truncate ${isActive ? 'text-blue-300' : 'text-slate-200 group-hover:text-white'}`}>
                  {item.iocValue.length > 26 ? item.iocValue.slice(0, 26) + '…' : item.iocValue}
                </p>
                {/* Meta row */}
                <div className="flex items-center justify-between mt-1 gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded ${typeBadge(item.iocType)}`}>
                      {item.iocType}
                    </span>
                    <span className={`font-mono text-xs font-semibold ${riskColor(item.riskScore)}`}>
                      {item.riskScore ?? '–'}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">{timeAgo(item.queriedAt)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Load more */}
      {items.length < total && (
        <div className="px-4 py-3 border-t border-slate-700">
          <button
            onClick={() => loadHistory(page + 1, true)}
            disabled={loading}
            className="w-full text-center text-blue-400 hover:text-blue-300 text-sm font-medium disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                Loading...
              </span>
            ) : (
              `Load more (${total - items.length} remaining)`
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default QueryHistory;
