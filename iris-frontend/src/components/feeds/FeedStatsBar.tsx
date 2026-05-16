import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { FeedRowModel } from './types';
import { formatSeconds } from './formatters';

interface FeedStatsBarProps {
  feeds: readonly FeedRowModel[];
  liveRequests?: number;
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
    <div className="iris-card p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-iris-accent/30">
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

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export default function FeedStatsBar({ feeds, liveRequests: liveRequestsProp }: FeedStatsBarProps) {
  const total = feeds.length;
  const online = feeds.filter((f) => f.health === 'healthy').length;
  const degraded = feeds.filter((f) => f.health === 'circuit_open').length;

  const avgLatency = avg(
    feeds.map((f) => f.avgLatencyMs).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
  );
  const avgP95 = avg(
    feeds.map((f) => f.p95LatencyMs).filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
  );

  const openCount = feeds.filter((f) => f.circuitState === 'OPEN').length;
  const halfOpenCount = feeds.filter((f) => f.circuitState === 'HALF_OPEN' || f.circuitState === 'RECOVERING').length;
  const liveRequests = typeof liveRequestsProp === 'number'
    ? liveRequestsProp
    : sum(feeds.map((f) => (f.quotaMode === 'remaining' ? 0 : f.quotaUsed)));
  const liveBudget = 1200;
  const liveQuotaPct = Math.min(Math.round((liveRequests / liveBudget) * 100), 100);

  return (
    <section className="grid grid-cols-4 gap-4 transition-opacity duration-300">
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
        value={`${liveQuotaPct}%`}
        subtitle={<span>{liveRequests} of {liveBudget} live calls</span>}
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
