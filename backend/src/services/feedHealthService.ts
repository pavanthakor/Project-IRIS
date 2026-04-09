/**
 * Feed health tracking service.
 *
 * Tracks per-feed metrics in Redis using sorted sets for rolling 1-hour windows.
 * Designed to be called from circuitBreaker.ts after each feed query — never
 * blocks or throws back to callers.
 */

import { redis } from '../config/database';
import { CircuitState } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const WINDOW_MS  = 60 * 60 * 1_000; // 1 hour
const WINDOW_TTL = 7_200;            // 2 h expiry on Redis keys

export const FEED_NAMES = [
  'VirusTotal',
  'AbuseIPDB',
  'Shodan',
  'IPInfo',
  'AbstractEmail',
] as const;

export type FeedName = (typeof FEED_NAMES)[number];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeedHealthMetrics {
  readonly feedName: string;
  readonly requestsLastHour: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly timeoutCount: number;
  readonly successRate: number;
  readonly avgLatencyMs: number;
  readonly p95LatencyMs: number;
  readonly state: CircuitState;
  readonly lastSuccessAt: string | null;
  readonly lastFailureAt: string | null;
}

// ── Redis key helpers ─────────────────────────────────────────────────────────

const hKey = (feed: string, metric: string): string =>
  `tip:feed:health:${feed}:${metric}`;

// ── Internals ─────────────────────────────────────────────────────────────────

async function readCircuitState(feedName: string): Promise<CircuitState> {
  try {
    const v = await redis.get(`tip:cb:${feedName}`);
    if (v === 'OPEN' || v === 'HALF_OPEN' || v === 'CLOSED' || v === 'RECOVERING') {
      return v;
    }
  } catch { /* fail-open */ }
  return 'CLOSED';
}

/**
 * Read latency values from the sorted set written by circuitBreaker.
 * Members are stored as "<timestamp>:<latencyMs>" with score = timestamp.
 */
async function readLatenciesLastHour(feedName: string): Promise<number[]> {
  const cutoff = Date.now() - WINDOW_MS;
  try {
    const members = await redis.zrangebyscore(
      `tip:feed:latency:${feedName}`,
      cutoff,
      '+inf'
    );
    return members
      .map(m => {
        const parts = m.split(':');
        return parseInt(parts[1] ?? '0', 10);
      })
      .filter(n => n > 0);
  } catch {
    return [];
  }
}

function calcP95(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    Math.floor(sorted.length * 0.95),
    sorted.length - 1
  );
  return sorted[idx] ?? 0;
}

function calcAvg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record the outcome of a single feed query.
 * Fire-and-forget safe — never throws.
 */
export function recordFeedOutcome(
  feedName: string,
  outcome: 'success' | 'failure' | 'timeout',
  latencyMs: number
): void {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const member = `${now}`;

  redis
    .pipeline()
    .zadd(hKey(feedName, 'requests'), now, member)
    .zadd(hKey(feedName, outcome),   now, member)
    .zremrangebyscore(hKey(feedName, 'requests'), '-inf', cutoff)
    .zremrangebyscore(hKey(feedName, outcome),   '-inf', cutoff)
    .expire(hKey(feedName, 'requests'), WINDOW_TTL)
    .expire(hKey(feedName, outcome),   WINDOW_TTL)
    .exec()
    .catch(() => undefined);

  // Update last-seen timestamps
  if (outcome === 'success') {
    redis.set(hKey(feedName, 'last_success'), now.toString(), 'EX', 86400).catch(() => undefined);
  } else {
    redis.set(hKey(feedName, 'last_failure'), now.toString(), 'EX', 86400).catch(() => undefined);
  }

  // Also prune the other outcome sets to prevent unbounded growth
  redis.zremrangebyscore(hKey(feedName, 'failure'), '-inf', cutoff).catch(() => undefined);
  redis.zremrangebyscore(hKey(feedName, 'timeout'), '-inf', cutoff).catch(() => undefined);
  redis.zremrangebyscore(hKey(feedName, 'success'), '-inf', cutoff).catch(() => undefined);
}

export async function getFeedHealth(feedName: string): Promise<FeedHealthMetrics> {
  const cutoff = Date.now() - WINDOW_MS;

  const [
    requests,
    successCount,
    failureCount,
    timeoutCount,
    lastSuccessRaw,
    lastFailureRaw,
    state,
  ] = await Promise.all([
    redis.zcount(hKey(feedName, 'requests'), cutoff, '+inf').catch(() => 0),
    redis.zcount(hKey(feedName, 'success'),  cutoff, '+inf').catch(() => 0),
    redis.zcount(hKey(feedName, 'failure'),  cutoff, '+inf').catch(() => 0),
    redis.zcount(hKey(feedName, 'timeout'),  cutoff, '+inf').catch(() => 0),
    redis.get(hKey(feedName, 'last_success')).catch(() => null),
    redis.get(hKey(feedName, 'last_failure')).catch(() => null),
    readCircuitState(feedName),
  ]);

  const latencies = await readLatenciesLastHour(feedName);
  const sorted    = [...latencies].sort((a, b) => a - b);

  const successRate =
    requests > 0 ? Math.round((successCount / requests) * 100) / 100 : 0;

  return {
    feedName,
    requestsLastHour: requests,
    successCount,
    failureCount,
    timeoutCount,
    successRate,
    avgLatencyMs:  calcAvg(sorted),
    p95LatencyMs:  calcP95(sorted),
    state,
    lastSuccessAt: lastSuccessRaw
      ? new Date(parseInt(lastSuccessRaw, 10)).toISOString()
      : null,
    lastFailureAt: lastFailureRaw
      ? new Date(parseInt(lastFailureRaw, 10)).toISOString()
      : null,
  };
}

export async function getAllFeedHealth(): Promise<Record<string, FeedHealthMetrics>> {
  const results = await Promise.all(
    FEED_NAMES.map(name => getFeedHealth(name))
  );
  return Object.fromEntries(results.map(m => [m.feedName, m]));
}
