/**
 * Multi-tier caching service backed by Redis.
 *
 * Key space (all prefixed with "tip:" to avoid collisions on shared Redis):
 *   tip:ioc:<sha256(ioc:type)>          — cached ThreatProfile (envelope format)
 *   tip:cache:stats:hits                — INCR counter
 *   tip:cache:stats:misses              — INCR counter
 *   tip:cache:stats:errors              — INCR counter
 *   tip:cache:stats:bg_refreshes        — INCR counter
 *
 * TTL strategy (seconds):
 *   CRITICAL / HIGH   → 1 800  (30 min)  — active threats change fast
 *   MEDIUM            → 3 600  (1 hr)
 *   LOW / NONE        → 14 400 (4 hr)    — stable IPs/domains
 *   UNKNOWN           → 300   (5 min)    — all feeds failed; retry soon
 *
 * Background refresh:
 *   On a cache hit, when remaining TTL < 25 % of the original TTL the caller's
 *   optional refreshFn is triggered fire-and-forget so the next request gets
 *   fresh data without waiting.
 */

import { createHash } from 'node:crypto';
import { ensureRedisConnection, redis } from '../config/database';
import { systemState } from './systemState';
import { IoCType, RiskLevel, ThreatProfile } from '../types';
import logger from '../utils/logger';

// ── Constants ─────────────────────────────────────────────────────────────────

const KEY_PREFIX        = 'tip:ioc:';
const STATS_PREFIX      = 'tip:cache:stats:';
const REFRESH_THRESHOLD = 0.25; // trigger bg refresh when TTL < 25 % remaining

const TTL_SECS: Record<RiskLevel, number> = {
  CRITICAL: 1_800,
  HIGH:     1_800,
  MEDIUM:   3_600,
  LOW:      14_400,
  NONE:     14_400,
  UNKNOWN:  300,
};

/** All IoC types — used by invalidateCacheByIoC to hit every possible key. */
const ALL_IOC_TYPES: IoCType[] = ['ip', 'domain', 'hash', 'email'];

// ── Cache envelope ─────────────────────────────────────────────────────────────

interface CacheEnvelope {
  v: 1;
  profile: ThreatProfile;
  originalTtlSecs: number;
}

function isEnvelope(val: unknown): val is CacheEnvelope {
  return (
    typeof val === 'object' &&
    val !== null &&
    (val as Record<string, unknown>).v === 1 &&
    typeof (val as Record<string, unknown>).profile === 'object'
  );
}

// ── Key helpers ────────────────────────────────────────────────────────────────

export function generateCacheKey(ioc: string, type: IoCType): string {
  return KEY_PREFIX + createHash('sha256').update(`${ioc}:${type}`).digest('hex');
}

// ── Stats helpers ──────────────────────────────────────────────────────────────

async function incrStat(metric: 'hits' | 'misses' | 'errors' | 'bg_refreshes'): Promise<void> {
  try {
    await redis.incr(`${STATS_PREFIX}${metric}`);
  } catch {
    // stats failure must never affect the request path
  }
}

async function readStat(metric: string): Promise<number> {
  try {
    const raw = await redis.get(`${STATS_PREFIX}${metric}`);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Retrieve a cached ThreatProfile.
 *
 * @param refreshFn  Optional async function called fire-and-forget when
 *                   remaining TTL drops below 25 % of the original TTL.
 *                   The function should re-query, correlate, and call
 *                   setCachedResult with the fresh result.
 */
export async function getCachedResult(
  ioc: string,
  type: IoCType,
  refreshFn?: () => Promise<unknown>
): Promise<ThreatProfile | null> {
  const key = generateCacheKey(ioc, type);

  try {
    await ensureRedisConnection();
    const raw = await redis.get(key);

    if (!raw) {
      void incrStat('misses');
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch (parseErr) {
      logger.warn('cache_parse_failed', {
        key, type, error: parseErr instanceof Error ? parseErr.message : 'unknown',
      });
      void redis.del(key).catch(() => undefined);
      void incrStat('errors');
      return null;
    }

    // Extract profile from envelope or legacy bare payload
    let profile: ThreatProfile;
    let originalTtlSecs: number | null = null;

    if (isEnvelope(parsed)) {
      profile         = parsed.profile;
      originalTtlSecs = parsed.originalTtlSecs;
    } else if (typeof parsed === 'object' && parsed !== null && 'queryId' in parsed) {
      // Legacy format — treat as valid; bg-refresh not available (no originalTtlSecs)
      profile = parsed as ThreatProfile;
    } else {
      logger.warn('cache_invalid_payload', { key, type });
      void redis.del(key).catch(() => undefined);
      void incrStat('errors');
      return null;
    }

    void incrStat('hits');

    // Background refresh check
    if (refreshFn && originalTtlSecs !== null) {
      try {
        const remainingTtl = await redis.ttl(key);
        if (remainingTtl > 0 && remainingTtl < originalTtlSecs * REFRESH_THRESHOLD) {
          void incrStat('bg_refreshes');
          logger.info('cache_bg_refresh_triggered', {
            key: key.slice(-8), remainingTtl, originalTtlSecs,
          });
          refreshFn().catch((err: unknown) => {
            logger.error('cache_bg_refresh_failed', {
              error: err instanceof Error ? err.message : 'unknown',
            });
          });
        }
      } catch (ttlErr) {
        logger.warn('cache_ttl_check_failed', {
          error: ttlErr instanceof Error ? ttlErr.message : 'unknown',
        });
      }
    }

    return { ...profile, cachedAt: new Date().toISOString() };
  } catch (err) {
    logger.warn('cache_get_failed', {
      key, type, error: err instanceof Error ? err.message : 'unknown',
    });
    void incrStat('errors');
    return null;
  }
}

/**
 * Store a ThreatProfile in cache with a TTL derived from its risk level.
 *
 * Skips caching when:
 *  - CACHE_ENABLED env var is "false"
 *  - Every feed failed (successCount === 0) — no useful data to cache
 */
export async function setCachedResult(
  ioc: string,
  type: IoCType,
  profile: ThreatProfile
): Promise<void> {
  if (process.env.CACHE_ENABLED?.toLowerCase() === 'false') return;

  // Don't cache all-fail results — a retry may get different results
  const successCount = profile.feeds.filter(f => f.status === 'success').length;
  if (successCount === 0) {
    logger.info('cache_skip_no_success', {
      ioc: ioc.slice(0, 8), type, feedCount: profile.feeds.length,
    });
    return;
  }

  const baseTtlSecs     = TTL_SECS[profile.riskLevel] ?? TTL_SECS.UNKNOWN;
  const originalTtlSecs = Math.max(60, Math.round(baseTtlSecs * systemState.getCacheTtlMultiplier()));
  const envelope: CacheEnvelope = { v: 1, profile, originalTtlSecs };
  const key = generateCacheKey(ioc, type);

  try {
    await ensureRedisConnection();
    await redis.set(key, JSON.stringify(envelope), 'EX', originalTtlSecs);
    logger.info('cache_set', {
      key: key.slice(-8), type, riskLevel: profile.riskLevel, ttlSecs: originalTtlSecs,
    });
  } catch (err) {
    logger.warn('cache_set_failed', {
      key, type, error: err instanceof Error ? err.message : 'unknown',
    });
    void incrStat('errors');
  }
}

// ── Cache statistics ───────────────────────────────────────────────────────────

export interface CacheStats {
  hits:        number;
  misses:      number;
  errors:      number;
  bgRefreshes: number;
  hitRate:     number;
}

export async function getCacheStats(): Promise<CacheStats> {
  const [hits, misses, errors, bgRefreshes] = await Promise.all([
    readStat('hits'),
    readStat('misses'),
    readStat('errors'),
    readStat('bg_refreshes'),
  ]);

  const total   = hits + misses;
  const hitRate = total > 0 ? Math.round((hits / total) * 1000) / 10 : 0;

  return { hits, misses, errors, bgRefreshes, hitRate };
}

// ── Cache invalidation ─────────────────────────────────────────────────────────

/** Invalidate a single (ioc, type) cache entry. */
export async function invalidateCache(ioc: string, type: IoCType): Promise<void> {
  const key = generateCacheKey(ioc, type);
  try {
    await ensureRedisConnection();
    await redis.del(key);
    logger.info('cache_invalidated', { type });
  } catch (err) {
    logger.warn('cache_invalidate_failed', {
      type, error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

/**
 * Invalidate a given IoC across all type variants (ip / domain / hash / email).
 * Returns the number of keys deleted.
 */
export async function invalidateCacheByIoC(ioc: string): Promise<number> {
  const keys = ALL_IOC_TYPES.map(t => generateCacheKey(ioc, t));
  try {
    await ensureRedisConnection();
    const deleted = await redis.del(...(keys as [string, ...string[]]));
    logger.info('cache_invalidated_by_ioc', { deleted });
    return deleted;
  } catch (err) {
    logger.warn('cache_invalidate_by_ioc_failed', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return 0;
  }
}

/**
 * Flush all IoC cache entries (tip:ioc:* pattern) using SCAN/DEL.
 *
 * Uses SCAN rather than FLUSHDB to preserve circuit-breaker state, rate-limit
 * counters, and cache stats on the shared Redis instance.
 *
 * Returns the number of keys deleted.
 */
export async function flushCache(): Promise<number> {
  try {
    await ensureRedisConnection();
    let cursor  = '0';
    let deleted = 0;

    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) {
        const n = await redis.del(...(keys as [string, ...string[]]));
        deleted += n;
      }
    } while (cursor !== '0');

    logger.info('cache_flushed', { deleted });
    return deleted;
  } catch (err) {
    logger.warn('cache_flush_failed', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return 0;
  }
}
