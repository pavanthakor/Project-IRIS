import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { RefreshCw } from 'lucide-react';
import FeedHealthTable from '../components/feeds/FeedHealthTable';
import FeedStatsBar from '../components/feeds/FeedStatsBar';
import { endpointHost } from '../components/feeds/formatters';
import type { FeedRowModel } from '../components/feeds/types';
import * as api from '../services/api';
import type { FeedHealth, HealthResponse, FeedHealthMetrics } from '../types';
import { FEED_CONFIG } from '../utils/constants';

type UptimeDayStatus = 'good' | 'warn' | 'bad';

const MAX_HISTORY_POINTS = 30;
const REFRESH_INTERVAL_MS = 5_000;

const LIVE_FEED_CAPS: Record<string, number | null> = {
  VirusTotal: 500,
  AbuseIPDB: 1000,
  Shodan: 100,
  IPInfo: null,
  ZeroBounce: 100,
  'AlienVault OTX': null,
};

function formatRelativeAge(target: Date | null, now: number): string {
  if (!target) return 'syncing';
  const diffSec = Math.max(0, Math.floor((now - target.getTime()) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

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

function statusSample(health: FeedHealth | 'unknown', metrics: FeedHealthMetrics | undefined): UptimeDayStatus {
  if (health === 'disabled') return 'bad';
  if (health === 'circuit_open' || metrics?.state === 'OPEN') return 'bad';
  if (health === 'unknown') return 'warn';

  if ((metrics?.requestsLastHour ?? 0) === 0) {
    // Idle feed: treat as healthy-but-idle rather than failed.
    return health === 'healthy' ? 'good' : 'warn';
  }

  const successRate = metrics?.successRate ?? 0;
  if (successRate >= 0.95 || metrics?.avgLatencyMs === undefined) return 'good';
  if (successRate >= 0.8) return 'warn';
  return 'bad';
}

function appendHistory(
  previous: Record<string, readonly UptimeDayStatus[]>,
  health: HealthResponse
): Record<string, readonly UptimeDayStatus[]> {
  const feedStatusRecord = health.feeds ?? {};
  const metricsRecord = health.feedHealth ?? {};

  const next: Record<string, readonly UptimeDayStatus[]> = {};

  for (const cfg of FEED_CONFIG) {
    const feedName = cfg.name;
    const sample = statusSample(
      (feedStatusRecord[feedName] as FeedHealth | undefined) ?? 'unknown',
      metricsRecord[feedName]
    );
    const existing = previous[feedName] ?? Array.from({ length: MAX_HISTORY_POINTS }, () => sample);
    next[feedName] = [...existing.slice(-MAX_HISTORY_POINTS + 1), sample];
  }

  return next;
}

export default function LiveFeedPage() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [pulse, setPulse] = useState(false);
  const [uptimeHistory, setUptimeHistory] = useState<Record<string, readonly UptimeDayStatus[]>>({});
  const [now, setNow] = useState(Date.now());

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
      setUptimeHistory((prev) => appendHistory(prev, data));
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
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const id = window.setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [autoRefresh, refresh]);

  const healthSummary = useMemo(() => {
    const feedEntries = Object.values(health?.feeds ?? {});
    const total = FEED_CONFIG.length;
    const healthy = feedEntries.filter((status) => status === 'healthy').length;
    const degraded = feedEntries.filter((status) => status === 'circuit_open').length;
    const dbState = health?.db ?? 'disconnected';
    const redisState = health?.redis ?? 'disconnected';
    return { total, healthy, degraded, dbState, redisState };
  }, [health]);

  const feeds: FeedRowModel[] = useMemo(() => {
    const feedStatusRecord = health?.feeds ?? {};
    const metricsRecord = health?.feedHealth ?? {};
    const quotaRecord = health?.quota ?? {};

    return FEED_CONFIG.map((cfg) => {
      const feedName = cfg.name;
      const rawHealth = (feedStatusRecord[feedName] as FeedHealth | undefined) ?? 'unknown';
      const metrics = metricsRecord[feedName];
      const quota = quotaRecord[feedName];
      const avgLatencyMs = metrics?.avgLatencyMs && metrics.avgLatencyMs > 0 ? metrics.avgLatencyMs : 0;
      const p95LatencyMs = metrics?.p95LatencyMs && metrics.p95LatencyMs > 0 ? metrics.p95LatencyMs : 0;
      const history = uptimeHistory[feedName] ?? Array.from({ length: MAX_HISTORY_POINTS }, () => statusSample(rawHealth, metrics));
      const uptimeBars = history.slice(-MAX_HISTORY_POINTS);
      const uptimeGood = uptimeBars.filter((s) => s === 'good').length;
      const uptimeWarn = uptimeBars.filter((s) => s === 'warn').length;
      const uptimePercent30d = uptimeBars.length > 0
        ? Math.round(((uptimeGood + uptimeWarn * 0.5) / uptimeBars.length) * 1000) / 10
        : 0;

      let quotaUsed = metrics?.requestsLastHour ?? 0;
      let quotaTotal = LIVE_FEED_CAPS[feedName] ?? null;
      let quotaMode: FeedRowModel['quotaMode'] = 'used';

      if (
        quota &&
        typeof quota.remaining === 'number' &&
        Number.isFinite(quota.remaining)
      ) {
        quotaUsed = Math.max(0, Math.round(quota.remaining));
        quotaTotal = typeof quota.total === 'number' && Number.isFinite(quota.total) ? Math.round(quota.total) : (quotaTotal ?? null);
        quotaMode = 'remaining';
      }

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
        uptimePercent30d,
        uptimeHistory30d: uptimeBars,
        quotaUsed,
        quotaTotal,
        quotaMode,
      } satisfies FeedRowModel;
    });
  }, [health, uptimeHistory]);

  const liveRequests = useMemo(() => {
    const metrics = health?.feedHealth ?? {};
    return Object.values(metrics).reduce((sum, item) => sum + (item?.requestsLastHour ?? 0), 0);
  }, [health]);

  return (
    <div className="space-y-4">
      <div className="iris-card relative overflow-hidden flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-all duration-300">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-iris-accent/70 to-transparent opacity-70" />
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span
              className={clsx(
                'absolute inline-flex h-full w-full rounded-full bg-iris-success opacity-50',
                (pulse || refreshing) && 'animate-ping'
              )}
            />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-iris-success" />
          </span>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-iris-text">Live monitoring</p>
              <span className="rounded-full border border-iris-success/30 bg-iris-success/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-iris-success">
                Streaming
              </span>
            </div>
            <p className="text-xs text-iris-text-muted">
              Last refreshed: {formatClockTime(lastRefreshedAt)} · {formatRelativeAge(lastRefreshedAt, now)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-iris-text-dim">Auto-refresh every 5s</span>
            <label className="relative inline-flex items-center" title="Toggle auto-refresh">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                aria-label="Auto-refresh every 5 seconds"
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

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-iris-border bg-iris-card/80 px-4 py-2 text-xs text-iris-text-muted transition-all duration-300">
        <span className={clsx('inline-flex h-2 w-2 rounded-full', refreshing ? 'bg-iris-warning animate-pulse' : 'bg-iris-success')} />
        <span>
          Backend {healthSummary.dbState} · Redis {healthSummary.redisState} · {healthSummary.healthy}/{healthSummary.total} feeds healthy
        </span>
        {healthSummary.degraded > 0 ? <span className="text-iris-warning">· {healthSummary.degraded} circuit breaker(s) active</span> : null}
      </div>

      <div className={clsx('transition-all duration-300', refreshing ? 'opacity-90' : 'opacity-100')}>
        <FeedStatsBar feeds={feeds} liveRequests={liveRequests} />
      </div>

      <FeedHealthTable feeds={feeds} loading={!health && refreshing} error={error} refreshing={refreshing} />
    </div>
  );
}
