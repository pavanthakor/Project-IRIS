import clsx from 'clsx';
import type { IoCType } from '../../types';
import type { FeedRowModel, UptimeDayStatus } from './types';
import { WIDTH_CLASSES, formatSeconds, latencyTone, quotaPercent, widthBucket } from './formatters';

interface FeedRowProps {
  feed: FeedRowModel;
}

function typeBadgeLabel(type: IoCType): string {
  switch (type) {
    case 'ip':
      return 'IP';
    case 'domain':
      return 'Domain';
    case 'hash':
      return 'Hash';
    case 'email':
      return 'Email';
    default:
      return String(type);
  }
}

function statusBadgeClasses(status: FeedRowModel['statusLabel']): string {
  switch (status) {
    case 'Operational':
      return 'bg-iris-success/20 text-iris-success border border-iris-success/30';
    case 'Degraded':
      return 'bg-iris-warning/20 text-iris-warning border border-iris-warning/30';
    case 'Outage':
      return 'bg-iris-danger/20 text-iris-danger border border-iris-danger/30';
    case 'Unknown':
    default:
      return 'bg-iris-border text-iris-text-muted border border-iris-border-light';
  }
}

function latencyTextClass(ms: number | null): string {
  const tone = latencyTone(ms ?? undefined);
  if (tone === 'bad') return 'text-iris-danger';
  if (tone === 'warn') return 'text-iris-warning';
  return 'text-iris-text';
}

function uptimeBarClass(status: UptimeDayStatus): string {
  switch (status) {
    case 'bad':
      return 'bg-iris-danger/80';
    case 'warn':
      return 'bg-iris-warning/80';
    case 'good':
    default:
      return 'bg-iris-success/80';
  }
}

export default function FeedRow({ feed }: FeedRowProps) {
  const quotaLabel = feed.quotaTotal === null ? `${feed.quotaUsed}/∞` : `${feed.quotaUsed}/${feed.quotaTotal}`;
  const quotaPct = quotaPercent(feed.quotaUsed, feed.quotaTotal);
  const quotaBucket = widthBucket(quotaPct);

  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,1.1fr)] gap-4 px-4 py-4">
      <div className="col-span-2 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-semibold text-iris-text">{feed.name}</p>
          <div className="flex flex-wrap justify-end gap-1">
            {feed.supportedTypes.map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-md border border-iris-border bg-iris-elevated px-2 py-1 text-[11px] font-semibold text-iris-text-dim"
              >
                {typeBadgeLabel(t)}
              </span>
            ))}
          </div>
        </div>
        <p className="mt-1 truncate font-mono text-xs text-iris-text-muted">{feed.endpointHost}</p>
      </div>

      <div className="flex items-start">
        <span className={clsx('iris-badge', statusBadgeClasses(feed.statusLabel))}>[{feed.statusLabel}]</span>
      </div>

      <div className="min-w-0">
        <p className={clsx('font-mono text-sm font-semibold', latencyTextClass(feed.avgLatencyMs))}>
          {formatSeconds(feed.avgLatencyMs, 2)}
        </p>
        <p className="mt-1 text-xs text-iris-text-muted">
          p95: <span className={latencyTextClass(feed.p95LatencyMs)}>{formatSeconds(feed.p95LatencyMs, 1)}</span>
        </p>
      </div>

      <div className="min-w-0">
        <p className="font-mono text-sm font-semibold text-iris-text">{feed.uptimePercent30d.toFixed(1)}%</p>
        <div className="mt-2 flex items-end gap-[2px]">
          {feed.uptimeHistory30d.slice(0, 30).map((s, idx) => (
            <span
              // eslint-disable-next-line react/no-array-index-key
              key={idx}
              className={clsx('h-7 w-1 rounded-sm', uptimeBarClass(s))}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>

      <div className="min-w-0">
        <p className="font-mono text-sm font-semibold text-iris-text">{quotaLabel}</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-iris-border/60">
          <div className={clsx('h-full rounded-full bg-iris-accent transition-all duration-300', WIDTH_CLASSES[quotaBucket])} />
        </div>
      </div>
    </div>
  );
}
