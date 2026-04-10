import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { RefreshCw } from 'lucide-react';
import FeedHealthTable from '../components/feeds/FeedHealthTable';
import FeedStatsBar from '../components/feeds/FeedStatsBar';
import { endpointHost } from '../components/feeds/formatters';
import { getMockLatency, getMockQuota, getMockUptime } from '../components/feeds/mockMetrics';
import type { FeedRowModel } from '../components/feeds/types';
import * as api from '../services/api';
import type { FeedHealth, HealthResponse } from '../types';
import { FEED_CONFIG } from '../utils/constants';

function formatClockTime(date: Date | null): string {
  if (!date) return '--:--:--';
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function mapOperationalStatus(health: FeedHealth | 'unknown'): FeedRowModel['operationalStatus'] {
  if (health === 'disabled') return 'outage';
  if (health === 'circuit_open') return 'degraded';
  if (health === 'healthy') return 'operational';
  return 'degraded';
}

function mapStatusLabel(health: FeedHealth | 'unknown'): FeedRowModel['statusLabel'] {
  if (health === 'disabled') return 'Outage';
  if (health === 'circuit_open') return 'Degraded';
  if (health === 'healthy') return 'Operational';
  return 'Unknown';
}

export default function LiveFeedPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [pulse, setPulse] = useState(false);

  const inFlightRef = useRef(false);
  const pulseTimerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    setPulse(true);
    setRefreshing(true);
    setError(null);

    try {
      const data = await api.getHealth();
      setHealth(data);
      const ts = new Date(data.timestamp);
      setLastRefreshedAt(Number.isNaN(ts.getTime()) ? new Date() : ts);
    } catch (err: unknown) {
      setError(api.getErrorMessage(err));
    } finally {
      setRefreshing(false);
      inFlightRef.current = false;
      pulseTimerRef.current = window.setTimeout(() => setPulse(false), 650);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
    };
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = window.setInterval(() => {
      void refresh();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [autoRefresh, refresh]);

  const feeds: FeedRowModel[] = useMemo(() => {
    const feedStatusRecord = health?.feeds ?? {};
    const metricsRecord = health?.feedHealth ?? {};

    return FEED_CONFIG.map((cfg) => {
      const feedName = cfg.name;
      const rawHealth = (feedStatusRecord[feedName] as FeedHealth | undefined) ?? 'unknown';
      const metrics = metricsRecord[feedName];

      const mockLatency = getMockLatency(feedName);
      const avgLatencyMs = metrics && metrics.avgLatencyMs > 0 ? metrics.avgLatencyMs : mockLatency.avgLatencyMs;
      const p95LatencyMs = metrics && metrics.p95LatencyMs > 0 ? metrics.p95LatencyMs : mockLatency.p95LatencyMs;

      const mockUptime = getMockUptime(feedName);
      const mockQuota = getMockQuota(feedName);

      return {
        name: feedName,
        endpointHost: endpointHost(cfg.endpoint),
        endpointUrl: cfg.endpoint,
        supportedTypes: cfg.supportedTypes,
        health: rawHealth,
        operationalStatus: mapOperationalStatus(rawHealth),
        statusLabel: mapStatusLabel(rawHealth),
        avgLatencyMs,
        p95LatencyMs,
        circuitState: metrics?.state ?? null,
        uptimePercent30d: mockUptime.uptimePercent30d,
        uptimeHistory30d: mockUptime.uptimeHistory30d,
        quotaUsed: mockQuota.quotaUsed,
        quotaTotal: mockQuota.quotaTotal,
      } satisfies FeedRowModel;
    });
  }, [health]);

  return (
    <div className="space-y-4">
      <div className="iris-card flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={clsx(
                'absolute inline-flex h-full w-full rounded-full bg-iris-success opacity-50',
                (pulse || refreshing) && 'animate-ping'
              )}
            />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-iris-success" />
          </span>

          <div>
            <p className="text-sm font-semibold text-iris-text">Live monitoring</p>
            <p className="text-xs text-iris-text-muted">Last refreshed: {formatClockTime(lastRefreshedAt)}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-iris-text-dim">Auto-refresh every 30s</span>
            <label className="relative inline-flex items-center" title="Toggle auto-refresh">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                aria-label="Auto-refresh every 30 seconds"
              />
              <span className="h-6 w-11 rounded-full border border-iris-border bg-iris-elevated transition-colors peer-checked:border-iris-accent/40 peer-checked:bg-iris-accent/15" />
              <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-iris-text-muted transition-transform peer-checked:translate-x-5 peer-checked:bg-iris-accent" />
            </label>
          </div>

          <button
            type="button"
            onClick={() => void refresh()}
            className="iris-btn-secondary inline-flex items-center gap-2 px-4 py-2 text-sm"
            disabled={refreshing}
          >
            <RefreshCw size={16} className={clsx(refreshing && 'animate-spin')} />
            Refresh now
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-iris-danger/40 bg-iris-danger/10 px-4 py-3 text-sm text-iris-danger">
          {error}
        </div>
      ) : null}

      <FeedStatsBar feeds={feeds} />
      <FeedHealthTable feeds={feeds} loading={!health && refreshing} error={error} refreshing={refreshing} />
    </div>
  );
}
