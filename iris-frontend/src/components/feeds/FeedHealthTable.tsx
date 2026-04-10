import clsx from 'clsx';
import FeedRow from './FeedRow';
import type { FeedRowModel } from './types';

interface FeedHealthTableProps {
  feeds: readonly FeedRowModel[];
  loading?: boolean;
  error?: string | null;
  refreshing?: boolean;
}

export default function FeedHealthTable({ feeds, loading = false, error, refreshing = false }: FeedHealthTableProps) {
  return (
    <section className={clsx('iris-card overflow-hidden', refreshing && 'ring-1 ring-iris-accent/10')}>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,1.1fr)] gap-4 border-b border-iris-border/60 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-iris-text-muted">
        <div>Feed</div>
        <div>Endpoint</div>
        <div>Status</div>
        <div>Latency</div>
        <div>Uptime 30d</div>
        <div>Quota</div>
      </div>

      {error ? (
        <div className="border-b border-iris-border/60 bg-iris-danger/10 px-4 py-3 text-sm text-iris-danger">
          {error}
        </div>
      ) : null}

      {loading && feeds.length === 0 ? (
        <div className="px-4 py-6 text-sm text-iris-text-dim">Loading feed health…</div>
      ) : null}

      {!loading && feeds.length === 0 ? (
        <div className="px-4 py-8 text-sm text-iris-text-dim">No feeds found.</div>
      ) : null}

      <div className="divide-y divide-iris-border/50">
        {feeds.map((feed) => (
          <div key={feed.name} className="hover:bg-iris-elevated/30 transition-colors">
            <FeedRow feed={feed} />
          </div>
        ))}
      </div>
    </section>
  );
}
