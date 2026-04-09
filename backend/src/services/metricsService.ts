/**
 * Centralised metrics collection service.
 *
 * All public "track" functions are fire-and-forget — they never throw back to
 * callers.  `getMetrics()` is the only async function intended to be awaited.
 *
 * Redis key map:
 *   tip:metrics:req:total               – total HTTP requests served
 *   tip:metrics:req:2xx / 4xx / 5xx    – bucketed by status class
 *   tip:metrics:req:time_total          – sum of response times (ms)
 *   tip:metrics:req:path:<path>         – per-normalised-path counts
 *   tip:metrics:req:5min:<windowId>     – total requests in 5-min window
 *   tip:metrics:slow_queries            – requests that took > 8 s
 *   tip:metrics:errors:5min:<windowId>  – 5xx errors in 5-min window
 *   tip:metrics:rl:rejected             – total rate-limit rejections
 *   tip:metrics:rl:offenders            – sorted set: member=id, score=count
 *   tip:metrics:feed:consec_fail:<name> – consecutive failure counter
 */

import v8 from 'node:v8';
import { redis, pool } from '../config/database';
import { getCacheStats } from './cache';
import { systemState } from './systemState';
import logger from '../utils/logger';

// ── Constants ─────────────────────────────────────────────────────────────────

const STARTUP_TIME          = Date.now();
const SLOW_QUERY_THRESHOLD  = 8_000;    // ms
const SLOW_FEED_P95_LIMIT   = 5_000;    // ms
const SLOW_FEED_MIN_SAMPLES = 10;
const ERROR_RATE_THRESHOLD  = 0.10;     // 10 %
const ERROR_RATE_MIN_REQ    = 10;       // minimum window requests before alerting
const FEED_DEGRADED_COUNT   = 10;       // consecutive failures before CRITICAL log
const WIN_5MIN_MS           = 5 * 60 * 1_000;
const WIN_5MIN_TTL_SEC      = 10 * 60;  // keep for 2 windows

// Memory thresholds (fraction of heap limit)
const MEM_WARN_RATIO     = 0.80;
const MEM_CRITICAL_RATIO = 0.90;

// ── CPU sampling ──────────────────────────────────────────────────────────────

let cpuPercent                   = 0;
let lastCpuSnapshot              = process.cpuUsage();
let lastCpuTime                  = Date.now();

setInterval(() => {
  const now     = Date.now();
  const elapsed = now - lastCpuTime;
  const usage   = process.cpuUsage(lastCpuSnapshot);
  lastCpuSnapshot = process.cpuUsage();
  lastCpuTime     = now;
  if (elapsed > 0) {
    cpuPercent = Math.round(((usage.user + usage.system) / 1_000 / elapsed) * 100 * 10) / 10;
  }
}, 10_000).unref();

// ── Memory pressure monitoring ────────────────────────────────────────────────

setInterval(() => {
  const stats      = v8.getHeapStatistics();
  const usedHeap   = stats.used_heap_size;
  const heapLimit  = stats.heap_size_limit;
  const usedRatio  = usedHeap / heapLimit;
  const usedMB     = Math.round(usedHeap  / 1_048_576);
  const limitMB    = Math.round(heapLimit / 1_048_576);
  const pct        = Math.round(usedRatio * 100);

  if (usedRatio >= MEM_CRITICAL_RATIO) {
    logger.error('memory_critical', { usedMB, limitMB, pct });
    systemState.setMemoryPressure('critical');
    // Attempt GC if the --expose-gc flag was passed at startup
    const gcFn = (globalThis as { gc?: () => void }).gc;
    if (typeof gcFn === 'function') gcFn();
  } else if (usedRatio >= MEM_WARN_RATIO) {
    logger.warn('memory_pressure', { usedMB, limitMB, pct });
    systemState.setMemoryPressure('warn');
  } else {
    systemState.setMemoryPressure('normal');
  }
}, 60_000).unref();

// ── DB pool exhaustion monitoring ─────────────────────────────────────────────

let dbIdleZeroSince: number | null = null;

setInterval(() => {
  const idle    = pool.idleCount;
  const total   = pool.totalCount;
  const waiting = pool.waitingCount;

  if (idle === 0 && total > 0) {
    if (dbIdleZeroSince === null) {
      dbIdleZeroSince = Date.now();
    } else if (Date.now() - dbIdleZeroSince > 30_000) {
      logger.error('db_pool_exhausted', {
        totalConnections:  total,
        idleConnections:   0,
        waitingRequests:   waiting,
        durationMs:        Date.now() - dbIdleZeroSince,
      });
    }
  } else {
    dbIdleZeroSince = null;
  }
}, 5_000).unref();

// ── Helpers ───────────────────────────────────────────────────────────────────

function windowId(): number {
  return Math.floor(Date.now() / WIN_5MIN_MS);
}

/**
 * Normalise an Express path for use in a Redis key.
 * Keeps at most 4 path segments; strips query strings.
 */
function normalizePath(rawPath: string): string {
  const parts = rawPath.split('/').filter(Boolean).slice(0, 4);
  return parts.length ? '/' + parts.join('/') : '/';
}

// ── Error-rate alerting ───────────────────────────────────────────────────────

async function checkErrorRateWindow(wid: number): Promise<void> {
  const errKey = `tip:metrics:errors:5min:${wid}`;
  const totKey = `tip:metrics:req:5min:${wid}`;
  try {
    const results = await redis
      .pipeline()
      .incr(errKey)
      .expire(errKey, WIN_5MIN_TTL_SEC)
      .exec();
    const errCount = (results?.[0]?.[1] as number) ?? 0;

    const totRaw   = await redis.get(totKey);
    const totCount = parseInt(totRaw ?? '0', 10);

    if (totCount >= ERROR_RATE_MIN_REQ && errCount / totCount > ERROR_RATE_THRESHOLD) {
      logger.error('high_error_rate', {
        windowId:     wid,
        errors:       errCount,
        total:        totCount,
        errorRatePct: Math.round((errCount / totCount) * 100),
      });
    }
  } catch { /* non-critical */ }
}

// ── Public tracking functions ─────────────────────────────────────────────────

/** Called from requestLogger on every completed request. */
export function trackRequest(
  statusCode:     number,
  responseTimeMs: number,
  path:           string
): void {
  const bucket         = statusCode >= 500 ? '5xx' : statusCode >= 400 ? '4xx' : '2xx';
  const normalizedPath = normalizePath(path);
  const wid            = windowId();
  const roundedMs      = Math.round(responseTimeMs);

  redis
    .pipeline()
    .incr('tip:metrics:req:total')
    .incr(`tip:metrics:req:${bucket}`)
    .incrby('tip:metrics:req:time_total', roundedMs)
    .incr(`tip:metrics:req:path:${normalizedPath}`)
    .expire(`tip:metrics:req:path:${normalizedPath}`, 86_400)
    .incr(`tip:metrics:req:5min:${wid}`)
    .expire(`tip:metrics:req:5min:${wid}`, WIN_5MIN_TTL_SEC)
    .exec()
    .catch(() => undefined);

  // Slow query detection
  if (responseTimeMs > SLOW_QUERY_THRESHOLD) {
    redis.incr('tip:metrics:slow_queries').catch(() => undefined);
    logger.warn('slow_query_detected', {
      path:           normalizedPath,
      responseTimeMs,
      statusCode,
    });
  }

  // Error rate alerting for 5xx responses
  if (statusCode >= 500) {
    checkErrorRateWindow(wid).catch(() => undefined);
  }
}

/** Called from advancedRateLimiter when a request is rejected. */
export function trackRateLimitRejection(identifier: string): void {
  redis
    .pipeline()
    .incr('tip:metrics:rl:rejected')
    .zincrby('tip:metrics:rl:offenders', 1, identifier)
    .exec()
    .catch(() => undefined);
}

/**
 * Called from circuitBreaker after each feed query.
 * Tracks consecutive failures and fires a CRITICAL log if threshold reached.
 */
export function trackFeedOutcome(feedName: string, success: boolean): void {
  const key = `tip:metrics:feed:consec_fail:${feedName}`;
  if (success) {
    redis.del(key).catch(() => undefined);
    return;
  }
  redis
    .incr(key)
    .then(count => {
      if (count >= FEED_DEGRADED_COUNT) {
        logger.error('feed_degraded', { feedName, consecutiveFailures: count });
      }
    })
    .catch(() => undefined);
}

/**
 * Called from circuitBreaker after a successful feed query.
 * Reads the latency sorted set and warns if P95 exceeds the threshold.
 */
export function checkSlowFeed(feedName: string): void {
  redis
    .zrange(`tip:feed:latency:${feedName}`, 0, -1)
    .then(members => {
      if (members.length < SLOW_FEED_MIN_SAMPLES) return;

      const latencies = members
        .map(m => parseInt(m.split(':')[1] ?? '0', 10))
        .filter(n => n > 0)
        .sort((a, b) => a - b);

      if (latencies.length < SLOW_FEED_MIN_SAMPLES) return;

      const p95idx = Math.min(
        Math.floor(latencies.length * 0.95),
        latencies.length - 1
      );
      const p95 = latencies[p95idx] ?? 0;

      if (p95 > SLOW_FEED_P95_LIMIT) {
        logger.warn('slow_feed_detected', {
          feedName,
          p95LatencyMs: p95,
          sampleCount:  latencies.length,
        });
      }
    })
    .catch(() => undefined);
}

// ── Full metrics snapshot ─────────────────────────────────────────────────────

export interface MetricsSnapshot {
  readonly uptime: number;
  readonly requests: {
    readonly total:            number;
    readonly success:          number;
    readonly clientError:      number;
    readonly serverError:      number;
    readonly avgResponseTimeMs: number;
    readonly slowQueries:      number;
  };
  readonly cache: {
    readonly hits:        number;
    readonly misses:      number;
    readonly hitRate:     number;
    readonly bgRefreshes: number;
    readonly errors:      number;
  };
  readonly database: {
    readonly poolSize:          number;
    readonly activeConnections: number;
    readonly idleConnections:   number;
    readonly waitingRequests:   number;
  };
  readonly rateLimit: {
    readonly totalRejected: number;
    readonly topOffenders:  ReadonlyArray<{ readonly key: string; readonly rejections: number }>;
  };
  readonly system: {
    readonly memoryUsageMB: {
      readonly rss:       number;
      readonly heapUsed:  number;
      readonly heapTotal: number;
    };
    readonly cpuUsagePercent: number;
    readonly nodeVersion:     string;
    readonly platform:        string;
  };
}

export async function getMetrics(): Promise<MetricsSnapshot> {
  const [
    totalRaw, raw2xx, raw4xx, raw5xx, timeRaw, slowRaw, rlRaw, offendersRaw,
  ] = await Promise.all([
    redis.get('tip:metrics:req:total')        .catch(() => '0'),
    redis.get('tip:metrics:req:2xx')          .catch(() => '0'),
    redis.get('tip:metrics:req:4xx')          .catch(() => '0'),
    redis.get('tip:metrics:req:5xx')          .catch(() => '0'),
    redis.get('tip:metrics:req:time_total')   .catch(() => '0'),
    redis.get('tip:metrics:slow_queries')     .catch(() => '0'),
    redis.get('tip:metrics:rl:rejected')      .catch(() => '0'),
    redis.zrevrange('tip:metrics:rl:offenders', 0, 4, 'WITHSCORES').catch(() => [] as string[]),
  ]);

  const total      = parseInt(totalRaw   ?? '0', 10);
  const success    = parseInt(raw2xx     ?? '0', 10);
  const clientErr  = parseInt(raw4xx     ?? '0', 10);
  const serverErr  = parseInt(raw5xx     ?? '0', 10);
  const timeTotal  = parseInt(timeRaw    ?? '0', 10);
  const slowQ      = parseInt(slowRaw    ?? '0', 10);
  const rlRejected = parseInt(rlRaw      ?? '0', 10);

  const avgResponseTimeMs = total > 0 ? Math.round(timeTotal / total) : 0;

  // Parse sorted-set WITHSCORES interleaved output: [key, score, key, score, ...]
  const topOffenders: Array<{ key: string; rejections: number }> = [];
  const arr = offendersRaw ?? [];
  for (let i = 0; i + 1 < arr.length; i += 2) {
    topOffenders.push({
      key:        arr[i]     ?? '',
      rejections: parseInt(arr[i + 1] ?? '0', 10),
    });
  }

  const cacheStats = await getCacheStats().catch(() => ({
    hits: 0, misses: 0, hitRate: 0, bgRefreshes: 0, errors: 0,
  }));

  const mem = process.memoryUsage();

  return {
    uptime: Math.round((Date.now() - STARTUP_TIME) / 1_000),
    requests: {
      total,
      success,
      clientError:       clientErr,
      serverError:       serverErr,
      avgResponseTimeMs,
      slowQueries:       slowQ,
    },
    cache: {
      hits:        cacheStats.hits,
      misses:      cacheStats.misses,
      hitRate:     cacheStats.hitRate,
      bgRefreshes: cacheStats.bgRefreshes,
      errors:      cacheStats.errors,
    },
    database: {
      poolSize:          pool.totalCount,
      activeConnections: pool.totalCount - pool.idleCount,
      idleConnections:   pool.idleCount,
      waitingRequests:   pool.waitingCount,
    },
    rateLimit: {
      totalRejected: rlRejected,
      topOffenders,
    },
    system: {
      memoryUsageMB: {
        rss:       Math.round(mem.rss       / 1_048_576),
        heapUsed:  Math.round(mem.heapUsed  / 1_048_576),
        heapTotal: Math.round(mem.heapTotal / 1_048_576),
      },
      cpuUsagePercent: cpuPercent,
      nodeVersion:     process.version,
      platform:        process.platform,
    },
  };
}
