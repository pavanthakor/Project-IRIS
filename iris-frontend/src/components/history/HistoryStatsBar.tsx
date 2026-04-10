import type { ReactNode } from 'react';

interface HistoryStatsBarProps {
  totalQueries: number;
  highRiskCount: number;
  avgLatencyLabel: string;
  cacheHits: number;
}

function StatCard({
  label,
  value,
  subtitle,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  subtitle: string;
  valueClassName?: string;
}) {
  return (
    <div className="iris-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-iris-text-muted">{label}</p>
      <p className={`mt-2 font-mono text-3xl font-bold leading-none text-iris-text ${valueClassName ?? ''}`}>{value}</p>
      <p className="mt-2 text-xs text-iris-text-muted">{subtitle}</p>
    </div>
  );
}

export default function HistoryStatsBar({
  totalQueries,
  highRiskCount,
  avgLatencyLabel,
  cacheHits,
}: HistoryStatsBarProps) {
  return (
    <section className="grid grid-cols-4 gap-4">
      <StatCard label="TOTAL QUERIES" value={totalQueries} subtitle="last 7 days" />
      <StatCard
        label="HIGH RISK"
        value={highRiskCount}
        subtitle="requiring action"
        valueClassName="text-iris-danger"
      />
      <StatCard label="FEEDS AVG LATENCY" value={avgLatencyLabel} subtitle="across all queries" />
      <StatCard label="CACHE HITS" value={cacheHits} subtitle="saved API quota" />
    </section>
  );
}
