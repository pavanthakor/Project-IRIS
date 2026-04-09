/**
 * Circuit breaker + adaptive timeout + per-feed response cache.
 *
 * State machine:
 *   CLOSED ──(failures >= threshold)──► OPEN
 *   OPEN   ──(elapsed >= 60 s)────────► HALF_OPEN  (single probe via NX lock)
 *   HALF_OPEN ──(probe success)────────► RECOVERING (25% pass-through, 60 s)
 *   HALF_OPEN ──(probe failure)────────► OPEN
 *   RECOVERING ──(>80% success)────────► CLOSED
 *   RECOVERING ──(>50% failure)────────► OPEN
 *   RECOVERING ──(window expired)──────► CLOSED (if fail ≤ 50%) or OPEN
 */

import { createHash } from 'node:crypto';
import { redis } from '../config/database';
import { FeedTimeoutError } from '../errors';
import { recordFeedOutcome } from '../services/feedHealthService';
import { checkSlowFeed, trackFeedOutcome } from '../services/metricsService';
import { CircuitState, FeedResult, IoCType } from '../types';
import { BaseFeed } from './baseFeed';

// ── Tuning constants ──────────────────────────────────────────────────────────

const FAILURE_THRESHOLD           = 5;
const OPEN_DURATION_MS            = 60_000;
const DEFAULT_TIMEOUT_MS          = 8_000;
const MIN_TIMEOUT_MS              = 3_000;
const MAX_TIMEOUT_MS              = 10_000;
const MAX_LATENCY_SAMPLES         = 100;
const FEED_RESPONSE_TTL_SECS      = 30 * 60; // 30 min
// Bump to v3+ whenever feed parsing/scoring semantics change to invalidate stale feed-response cache automatically.
const FEED_CACHE_VERSION          = 'v2';

const RECOVERING_DURATION_MS      = 60_000;
const RECOVERING_PASS_RATE        = 0.25;
const RECOVERING_SUCCESS_THRESHOLD = 0.80;
const RECOVERING_FAIL_THRESHOLD   = 0.50;
const RECOVERING_MIN_SAMPLES      = 5;

// ── Redis key helpers ─────────────────────────────────────────────────────────

const stateKey      = (f: string): string => `tip:cb:${f}`;
const failuresKey   = (f: string): string => `tip:cb:${f}:failures`;
const openedAtKey   = (f: string): string => `tip:cb:${f}:openedAt`;
const probingKey    = (f: string): string => `tip:cb:${f}:probing`;
const recStartKey   = (f: string): string => `tip:cb:${f}:rec:start`;
const recSuccessKey = (f: string): string => `tip:cb:${f}:rec:success`;
const recTotalKey   = (f: string): string => `tip:cb:${f}:rec:total`;
const latencyKey    = (f: string): string => `tip:feed:latency:${f}`;

const feedCacheKey = (f: string, type: IoCType, ioc: string): string =>
  `tip:feed:response:${FEED_CACHE_VERSION}:${f}:${createHash('sha256').update(`${type}:${ioc}`).digest('hex')}`;

// ── Adaptive timeout ──────────────────────────────────────────────────────────

export async function recordLatency(
  feedName: string,
  latencyMs: number
): Promise<void> {
  try {
    const now = Date.now();
    const key = latencyKey(feedName);
    // member encodes both timestamp (for rolling-window queries) and latency
    await redis.zadd(key, now, `${now}:${latencyMs}`);
    // Keep only the most recent MAX_LATENCY_SAMPLES entries by rank
    await redis.zremrangebyrank(key, 0, -(MAX_LATENCY_SAMPLES + 1));
    await redis.expire(key, 7_200); // 2 h
  } catch { /* fail-open */ }
}

export async function getAdaptiveTimeout(feedName: string): Promise<number> {
  try {
    const members = await redis.zrange(latencyKey(feedName), 0, -1);
    if (members.length === 0) return DEFAULT_TIMEOUT_MS;

    const latencies = members
      .map(m => parseInt(m.split(':')[1] ?? '0', 10))
      .filter(n => n > 0)
      .sort((a, b) => a - b);

    if (latencies.length === 0) return DEFAULT_TIMEOUT_MS;

    const p95idx = Math.min(
      Math.floor(latencies.length * 0.95),
      latencies.length - 1
    );
    const p95 = latencies[p95idx] ?? DEFAULT_TIMEOUT_MS;

    return Math.min(Math.max(p95 * 1.5, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
  } catch {
    return DEFAULT_TIMEOUT_MS;
  }
}

// ── Circuit state helpers ─────────────────────────────────────────────────────

const readCircuitState = async (feedName: string): Promise<CircuitState> => {
  try {
    const v = await redis.get(stateKey(feedName));
    if (
      v === 'OPEN'      || v === 'HALF_OPEN' ||
      v === 'CLOSED'    || v === 'RECOVERING'
    ) return v;
  } catch { /* fail-open */ }
  return 'CLOSED';
};

export const getCircuitState = readCircuitState;

/** Forcibly close a circuit and reset its failure counter (used by auto-recovery). */
export async function resetCircuit(feedName: string): Promise<void> {
  await setCircuitState(feedName, 'CLOSED');
  await resetFailureCounter(feedName);
}

const setCircuitState = async (f: string, s: CircuitState): Promise<void> => {
  try { await redis.set(stateKey(f), s); } catch { /* fail-open */ }
};

const resetFailureCounter = async (f: string): Promise<void> => {
  try { await redis.set(failuresKey(f), '0'); } catch { /* fail-open */ }
};

const markCircuitOpen = async (f: string): Promise<void> => {
  try { await redis.set(stateKey(f), 'OPEN'); }    catch { /* fail-open */ }
  try { await redis.set(openedAtKey(f), Date.now().toString()); } catch { /* fail-open */ }
};

const incrementFailuresAndRead = async (f: string): Promise<number> => {
  try {
    const n = await redis.incr(failuresKey(f));
    return Number.isFinite(n) ? n : 0;
  } catch { return 0; }
};

const readOpenedAt = async (f: string): Promise<number | null> => {
  try {
    const v = await redis.get(openedAtKey(f));
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
};

// ── Half-open probe lock ──────────────────────────────────────────────────────

/** Returns true if the lock was acquired (this request should be the probe). */
const acquireProbingLock = async (f: string): Promise<boolean> => {
  try {
    const r = await redis.set(probingKey(f), '1', 'EX', 10, 'NX');
    return r === 'OK';
  } catch {
    return true; // fail-open: allow probe if Redis is down
  }
};

const releaseProbingLock = async (f: string): Promise<void> => {
  try { await redis.del(probingKey(f)); } catch { /* fail-open */ }
};

// ── Recovering state ──────────────────────────────────────────────────────────

const enterRecovering = async (f: string): Promise<void> => {
  try {
    await redis
      .pipeline()
      .set(stateKey(f),      'RECOVERING')
      .set(recStartKey(f),   Date.now().toString())
      .set(recSuccessKey(f), '0')
      .set(recTotalKey(f),   '0')
      .exec();
  } catch { /* fail-open */ }
};

const recordRecoveringResult = async (
  feedName: string,
  success: boolean
): Promise<void> => {
  try {
    await redis.incr(recTotalKey(feedName));
    if (success) await redis.incr(recSuccessKey(feedName));

    const [totalRaw, successRaw, startRaw] = await Promise.all([
      redis.get(recTotalKey(feedName)),
      redis.get(recSuccessKey(feedName)),
      redis.get(recStartKey(feedName)),
    ]);

    const total   = parseInt(totalRaw   ?? '0', 10);
    const succCnt = parseInt(successRaw ?? '0', 10);
    if (total < RECOVERING_MIN_SAMPLES) return;

    const failCnt     = total - succCnt;
    const successRate = succCnt / total;
    const failRate    = failCnt / total;
    const start       = startRaw ? parseInt(startRaw, 10) : Date.now();
    const elapsed     = Date.now() - start;

    if (successRate >= RECOVERING_SUCCESS_THRESHOLD) {
      await setCircuitState(feedName, 'CLOSED');
      await resetFailureCounter(feedName);
    } else if (failRate > RECOVERING_FAIL_THRESHOLD) {
      await markCircuitOpen(feedName);
    } else if (elapsed > RECOVERING_DURATION_MS) {
      // Window expired — give benefit of the doubt if majority succeeded
      if (failRate <= RECOVERING_FAIL_THRESHOLD) {
        await setCircuitState(feedName, 'CLOSED');
        await resetFailureCounter(feedName);
      } else {
        await markCircuitOpen(feedName);
      }
    }
  } catch { /* fail-open */ }
};

// ── Per-feed response cache ───────────────────────────────────────────────────

const getFeedCacheResponse = async (
  feedName: string,
  type: IoCType,
  ioc: string
): Promise<FeedResult | null> => {
  try {
    const raw = await redis.get(feedCacheKey(feedName, type, ioc));
    if (!raw) return null;
    return JSON.parse(raw) as FeedResult;
  } catch { return null; }
};

const setFeedCacheResponse = async (
  feedName: string,
  type: IoCType,
  ioc: string,
  result: FeedResult
): Promise<void> => {
  try {
    await redis.set(
      feedCacheKey(feedName, type, ioc),
      JSON.stringify(result),
      'EX',
      FEED_RESPONSE_TTL_SECS
    );
  } catch { /* fail-open */ }
};

// ── Feed timeout wrapper ──────────────────────────────────────────────────────

const withFeedTimeout = async (
  feed: BaseFeed,
  ioc: string,
  type: IoCType,
  timeoutMs: number
): Promise<FeedResult> => {
  let handle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      feed.query(ioc, type),
      new Promise<never>((_, reject) => {
        handle = setTimeout(
          () => reject(new FeedTimeoutError('Feed query timed out', feed.name)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (handle) clearTimeout(handle);
  }
};

// ── Main entry point ──────────────────────────────────────────────────────────

export const queryWithCircuitBreaker = async (
  feed: BaseFeed,
  ioc: string,
  type: IoCType
): Promise<FeedResult> => {
  // ── 1. Cheap checks ────────────────────────────────────────────────────────
  if (!feed.isEnabled()) {
    return { status: 'disabled', feedName: feed.name, latencyMs: 0 };
  }
  if (!feed.supportsType(type)) {
    return { status: 'unsupported', feedName: feed.name, latencyMs: 0 };
  }

  // ── 2. Per-feed response cache (skip external call entirely) ───────────────
  const cached = await getFeedCacheResponse(feed.name, type, ioc);
  if (cached) {
    return { ...cached, feedName: feed.name };
  }

  // ── 3. Circuit breaker state ────────────────────────────────────────────────
  let effectiveState = await readCircuitState(feed.name);

  if (effectiveState === 'OPEN') {
    const openedAt = await readOpenedAt(feed.name);
    const elapsed  = openedAt === null ? OPEN_DURATION_MS : Date.now() - openedAt;

    if (elapsed < OPEN_DURATION_MS) {
      return { status: 'circuit_open', feedName: feed.name, latencyMs: 0 };
    }
    // Transition: OPEN → HALF_OPEN
    await setCircuitState(feed.name, 'HALF_OPEN');
    effectiveState = 'HALF_OPEN';
  }

  // Single-probe lock for HALF_OPEN
  let isHalfOpenProbe = false;
  if (effectiveState === 'HALF_OPEN') {
    const gotLock = await acquireProbingLock(feed.name);
    if (!gotLock) {
      // Another probe is already in flight
      return { status: 'circuit_open', feedName: feed.name, latencyMs: 0 };
    }
    isHalfOpenProbe = true;
  }

  // RECOVERING: apply 25% pass-through, or expire window and decide
  if (effectiveState === 'RECOVERING') {
    const startRaw = await redis.get(recStartKey(feed.name)).catch(() => null);
    const start    = startRaw ? parseInt(startRaw, 10) : Date.now();
    const elapsed  = Date.now() - start;

    if (elapsed > RECOVERING_DURATION_MS) {
      // Window expired — evaluate final state right now
      const [totalRaw, successRaw] = await Promise.all([
        redis.get(recTotalKey(feed.name)).catch(() => '0'),
        redis.get(recSuccessKey(feed.name)).catch(() => '0'),
      ]);
      const total   = parseInt(totalRaw   ?? '0', 10);
      const succCnt = parseInt(successRaw ?? '0', 10);
      const failRate = total > 0 ? (total - succCnt) / total : 0;

      if (failRate > RECOVERING_FAIL_THRESHOLD) {
        await markCircuitOpen(feed.name);
        return { status: 'circuit_open', feedName: feed.name, latencyMs: 0 };
      }
      await setCircuitState(feed.name, 'CLOSED');
      await resetFailureCounter(feed.name);
      effectiveState = 'CLOSED';
    } else if (Math.random() >= RECOVERING_PASS_RATE) {
      // 75% of requests are shed during recovery
      return { status: 'circuit_open', feedName: feed.name, latencyMs: 0 };
    }
  }

  // ── 4. Execute the feed query ───────────────────────────────────────────────
  const startedAt = Date.now();

  try {
    const timeoutMs = await getAdaptiveTimeout(feed.name);
    const result    = await withFeedTimeout(feed, ioc, type, timeoutMs);
    const latencyMs = Date.now() - startedAt;

    // Record latency for adaptive timeout and health metrics
    await recordLatency(feed.name, latencyMs);
    recordFeedOutcome(feed.name, 'success', latencyMs);
    trackFeedOutcome(feed.name, true);
    checkSlowFeed(feed.name);

    // Cache the successful response
    await setFeedCacheResponse(feed.name, type, ioc, { ...result, latencyMs });

    // Update circuit state
    if (isHalfOpenProbe) {
      await enterRecovering(feed.name);
      await releaseProbingLock(feed.name);
    } else if (effectiveState === 'RECOVERING') {
      await recordRecoveringResult(feed.name, true);
    } else {
      // CLOSED — reset failure counter on success
      await resetFailureCounter(feed.name);
    }

    return { ...result, feedName: feed.name, latencyMs };

  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const isTimeout = error instanceof FeedTimeoutError;
    const message   = error instanceof Error ? error.message : 'unknown feed failure';

    await recordLatency(feed.name, latencyMs);
    recordFeedOutcome(feed.name, isTimeout ? 'timeout' : 'failure', latencyMs);
    trackFeedOutcome(feed.name, false);

    if (isHalfOpenProbe) {
      await markCircuitOpen(feed.name);
      await releaseProbingLock(feed.name);
    } else if (effectiveState === 'RECOVERING') {
      await recordRecoveringResult(feed.name, false);
    } else {
      const failures = await incrementFailuresAndRead(feed.name);
      if (failures >= FAILURE_THRESHOLD) {
        await markCircuitOpen(feed.name);
      }
    }

    return {
      status:    isTimeout ? 'timeout' : 'failed',
      feedName:  feed.name,
      error:     message,
      latencyMs,
    };
  }
};
