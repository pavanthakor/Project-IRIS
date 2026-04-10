import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { FeedRowModel } from './types';
import { formatSeconds } from './formatters';
import { getMockQuotaSummary } from './mockMetrics';

interface FeedStatsBarProps {
  feeds: readonly FeedRowModel[];
}

function StatCard({
  label,
  value,
  subtitle,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  subtitle: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="iris-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-iris-text-muted">{label}</p>
      <p className={clsx('mt-2 font-mono text-3xl font-bold leading-none text-iris-text', valueClassName)}>{value}</p>
      <p className="mt-2 text-xs text-iris-text-muted">{subtitle}</p>
    </div>
  );
}

function avg(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export default function FeedStatsBar({ feeds }: FeedStatsBarProps) {
  const total = feeds.length;
  const online = feeds.filter((f) => f.operationalStatus !== 'outage').length;
  const degraded = feeds.filter((f) => f.operationalStatus === 'degraded').length;

  const avgLatency = avg(
    feeds.map((f) => f.avgLatencyMs).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
  );
  const avgP95 = avg(
    feeds.map((f) => f.p95LatencyMs).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
  );

  const openCount = feeds.filter((f) => f.circuitState === 'OPEN').length;
  const halfOpenCount = feeds.filter((f) => f.circuitState === 'HALF_OPEN' || f.circuitState === 'RECOVERING').length;

  // Backend doesn't provide per-day quota consumption yet; use a realistic mock summary.
  const quotaSummary = getMockQuotaSummary();

  return (
    <section className="grid grid-cols-4 gap-4">
      <StatCard
        label="FEEDS ONLINE"
        value={
          <span className="text-iris-success">
            {online}/{total}
          </span>
        }
        subtitle={
          <span>
            {degraded} degraded
          </span>
        }
      />

      <StatCard
        label="AVG LATENCY"
        value={avgLatency === null ? '—' : formatSeconds(avgLatency, 2)}
        subtitle={<span>p95: {avgP95 === null ? '—' : formatSeconds(avgP95, 1)}</span>}
      />

      <StatCard
        label="QUOTA USED TODAY"
        value={quotaSummary.percentLabel}
        subtitle={quotaSummary.detailLabel}
      />

      <StatCard
        label="CIRCUIT BREAKERS"
        value={`${openCount} open`}
        subtitle={`${halfOpenCount} half-open`}
        valueClassName={openCount === 0 ? 'text-iris-success' : 'text-iris-danger'}
      />
    </section>
  );
}
