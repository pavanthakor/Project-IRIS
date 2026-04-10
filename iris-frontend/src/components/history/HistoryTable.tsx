import clsx from 'clsx';
import { ArrowUpRight } from 'lucide-react';
import type { IoCType, QueryHistoryItem, ThreatProfile } from '../../types';
import { timeAgo } from '../../utils/formatters';
import RiskScoreBar from './RiskScoreBar';

type HistoryVerdict = 'High risk' | 'Suspicious' | 'Clean' | 'Unknown';

interface HistoryTableProps {
  items: readonly QueryHistoryItem[];
  total: number;
  loading?: boolean;
  loadingMore?: boolean;
  error?: string | null;
  canLoadMore?: boolean;
  onLoadMore?: () => void;
  onRowClick: (item: QueryHistoryItem) => void;
  onRerun: (item: QueryHistoryItem) => void;
  detailsById?: Record<string, ThreatProfile | undefined>;
}

function typeLabel(type: IoCType): string {
  switch (type) {
    case 'ip':
      return 'IP';
    case 'domain':
      return 'DOMAIN';
    case 'hash':
      return 'HASH';
    case 'email':
      return 'EMAIL';
    default:
      return String(type).toUpperCase();
  }
}

function verdictForScore(score: number | null): HistoryVerdict {
  if (typeof score !== 'number') return 'Unknown';
  if (score >= 60) return 'High risk';
  if (score >= 40) return 'Suspicious';
  return 'Clean';
}

function verdictBadgeClasses(verdict: HistoryVerdict): string {
  switch (verdict) {
    case 'High risk':
      return 'bg-iris-danger/20 text-iris-danger border border-iris-danger/30';
    case 'Suspicious':
      return 'bg-iris-warning/20 text-iris-warning border border-iris-warning/30';
    case 'Clean':
      return 'bg-iris-success/20 text-iris-success border border-iris-success/30';
    case 'Unknown':
    default:
      return 'bg-iris-border text-iris-text-muted border border-iris-border-light';
  }
}

function verdictDotClasses(verdict: HistoryVerdict): string {
  switch (verdict) {
    case 'High risk':
      return 'bg-iris-danger';
    case 'Suspicious':
      return 'bg-iris-warning';
    case 'Clean':
      return 'bg-iris-success';
    case 'Unknown':
    default:
      return 'bg-iris-text-muted';
  }
}

export default function HistoryTable({
  items,
  total,
  loading = false,
  loadingMore = false,
  error,
  canLoadMore = false,
  onLoadMore,
  onRowClick,
  onRerun,
  detailsById,
}: HistoryTableProps) {
  const showing = items.length;

  return (
    <section className="iris-card overflow-hidden">
      <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.2fr)] gap-4 border-b border-iris-border/60 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-iris-text-muted">
        <div>Indicator</div>
        <div>Risk Score</div>
        <div>Verdict</div>
        <div className="text-right">Queried</div>
      </div>

      {error ? (
        <div className="border-b border-iris-border/60 bg-iris-danger/10 px-4 py-3 text-sm text-iris-danger">
          {error}
        </div>
      ) : null}

      <div className="divide-y divide-iris-border/50">
        {loading && items.length === 0 ? (
          <div className="px-4 py-6 text-sm text-iris-text-dim">Loading history…</div>
        ) : null}

        {!loading && items.length === 0 ? (
          <div className="px-4 py-8 text-sm text-iris-text-dim">No queries found.</div>
        ) : null}

        {items.map((item) => {
          const verdict = verdictForScore(item.riskScore);
          const cached = Boolean(detailsById?.[item.id]?.cachedAt);
          const onClick = () => onRowClick(item);

          return (
            <div
              key={item.id}
              className={clsx(
                'relative grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.2fr)] gap-4 px-4 py-4 transition-colors',
                'cursor-pointer hover:bg-iris-elevated/40 focus-within:bg-iris-elevated/40'
              )}
            >
              <button
                type="button"
                onClick={onClick}
                className="absolute inset-0 z-10"
                aria-label={`Open analysis for ${item.iocValue}`}
              />

              <div className="min-w-0">
                <div className="flex items-start gap-3">
                  <span className={clsx('mt-1 h-2.5 w-2.5 rounded-full', verdictDotClasses(verdict))} />
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm text-iris-text">{item.iocValue}</div>
                    <div className="mt-1 text-xs text-iris-text-muted">
                      <span className="font-semibold tracking-wide">{typeLabel(item.iocType)}</span>
                      {cached ? <span> · cached</span> : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center">
                <RiskScoreBar score={item.riskScore} className="w-full max-w-[260px]" />
              </div>

              <div className="flex items-center">
                <span className={clsx('iris-badge', verdictBadgeClasses(verdict))}>{verdict}</span>
              </div>

              <div className="flex items-center justify-end gap-3">
                <span className="whitespace-nowrap text-xs text-iris-text-muted">{timeAgo(item.queriedAt)}</span>
                <button
                  type="button"
                  className="iris-btn-secondary relative z-20 inline-flex items-center gap-1 px-3 py-2 text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRerun(item);
                  }}
                >
                  Re-run <ArrowUpRight size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-t border-iris-border/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-iris-text-muted">
          Showing <span className="font-mono text-iris-text">{showing}</span> of{' '}
          <span className="font-mono text-iris-text">{total}</span> results
        </p>

        {canLoadMore && onLoadMore ? (
          <button
            type="button"
            className="iris-btn-secondary px-4 py-2 text-sm"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        ) : null}
      </div>
    </section>
  );
}
