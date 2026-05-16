import { useState, useEffect, useCallback } from 'react';
import { getHealth } from '@/services/api';

interface FeedHealth {
  name: string;
  status: 'ok' | 'degraded' | 'down' | 'unknown';
  latencyMs?: number;
  note?: string;
}

interface HealthResponse {
  status: string;
  feeds?: Record<string, { status: string; latencyMs?: number; note?: string }>;
  uptime?: number;
  timestamp?: string;
}

const STATUS_STYLES = {
  ok:       'text-green-400 bg-green-900/30 border-green-700',
  degraded: 'text-yellow-400 bg-yellow-900/30 border-yellow-700',
  down:     'text-red-400 bg-red-900/30 border-red-700',
  unknown:  'text-slate-400 bg-slate-800 border-slate-600',
};

const STATUS_DOT = {
  ok:       'bg-green-400',
  degraded: 'bg-yellow-400',
  down:     'bg-red-400',
  unknown:  'bg-slate-500',
};

export default function LiveFeedPage() {
  const [feeds, setFeeds] = useState<FeedHealth[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = useCallback(async () => {
    try {
      const health = await getHealth() as HealthResponse;
      const feedEntries: FeedHealth[] = health.feeds
        ? Object.entries(health.feeds).map(([name, data]) => ({
            name,
            status: (data.status as FeedHealth['status']) ?? 'unknown',
            latencyMs: data.latencyMs,
            note: data.note,
          }))
        : [
            { name: 'VirusTotal',    status: 'unknown' },
            { name: 'AbuseIPDB',     status: 'unknown' },
            { name: 'Shodan',        status: 'unknown' },
            { name: 'IPInfo',        status: 'unknown' },
            { name: 'ZeroBounce',    status: 'unknown' },
            { name: 'AlienVault OTX', status: 'unknown' },
          ];
      setFeeds(feedEntries);
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError('Could not reach backend health endpoint.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const allOk = feeds.every(f => f.status === 'ok');
  const anyDown = feeds.some(f => f.status === 'down');
  const overallStatus = anyDown ? 'down' : allOk ? 'ok' : 'degraded';

  return (
    <div className="p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Live Feed Status</h1>
          <p className="text-slate-400 text-sm mt-1">
            {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Loading…'}
          </p>
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 rounded-lg text-slate-300 transition-colors"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Overall status banner */}
      <div className={`flex items-center gap-3 rounded-xl px-5 py-4 border ${STATUS_STYLES[overallStatus]}`}>
        <span className={`h-3 w-3 rounded-full ${STATUS_DOT[overallStatus]} animate-pulse`} />
        <span className="font-semibold capitalize">
          {overallStatus === 'ok' ? 'All feeds operational' :
           overallStatus === 'degraded' ? 'Some feeds degraded' :
           'Feed(s) down'}
        </span>
      </div>

      {/* Feed cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {feeds.map(feed => (
          <div
            key={feed.name}
            className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-100">{feed.name}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded border uppercase ${STATUS_STYLES[feed.status]}`}>
                {feed.status}
              </span>
            </div>
            {feed.latencyMs !== undefined && (
              <div className="text-sm text-slate-400">
                Latency: <span className="text-slate-200 font-mono">{feed.latencyMs}ms</span>
              </div>
            )}
            {feed.note && (
              <p className="text-xs text-slate-500">{feed.note}</p>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-600 text-center">Auto-refreshes every 30 seconds</p>
    </div>
  );
}
