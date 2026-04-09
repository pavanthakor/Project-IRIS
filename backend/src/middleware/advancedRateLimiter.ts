/**
 * Sliding-window rate limiter backed by Redis sorted sets.
 *
 * Algorithm (per scope key):
 *   - One sorted-set key per user+scope holds request timestamps as scores.
 *   - A single atomic Lua script removes stale entries, counts within each
 *     window (minute / hour / day), and adds the request only if every window
 *     passes.  This prevents the cross-window "phantom count" problem that
 *     arises when separate per-window keys are written independently.
 *
 * Fallback:
 *   - When Redis is unreachable, an in-memory Map<string, number[]> is used
 *     with identical window logic.
 *   - A 30-second background probe re-enables Redis automatically when it
 *     recovers.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { redisClient } from '../config/database';
import { fireAudit } from '../services/auditService';
import { trackRateLimitRejection } from '../services/metricsService';
import logger from '../utils/logger';

// ── Tier configuration ────────────────────────────────────────────────────────

export const RATE_LIMITS = {
  unauthenticated: { perMinute:   5, perHour:    30, perDay:    100 },
  free:            { perMinute:  20, perHour:   200, perDay:  1_000 },
  pro:             { perMinute: 100, perHour: 2_000, perDay: 10_000 },
  enterprise:      { perMinute: 500, perHour: 10_000, perDay: 50_000 },
} as const;

type TierKey = keyof typeof RATE_LIMITS;

// Mutable-number version used internally (avoids literal-type narrowing issues
// when we double the limits for GET requests at runtime).
interface WindowLimits {
  perMinute: number;
  perHour:   number;
  perDay:    number;
}

// Window sizes in milliseconds
const MIN_MS  =        60_000;
const HR_MS   =     3_600_000;
const DAY_MS  =    86_400_000;
// DAY_TTL is used inside the Lua EXPIRE call (86401 seconds), not in TS code.

// ── Lua scripts ───────────────────────────────────────────────────────────────

/**
 * Multi-window sliding check (tier rate limiter).
 *
 * KEYS[1]  = rate-limit key
 * ARGV[1]  = now (ms)
 * ARGV[2]  = limit/minute
 * ARGV[3]  = limit/hour
 * ARGV[4]  = limit/day
 * ARGV[5]  = unique member (request fingerprint)
 *
 * Returns: {allowed(0|1), count, limit, resetAt_ms(int), windowName}
 */
const MULTI_WINDOW_LUA = `
local key      = KEYS[1]
local now      = tonumber(ARGV[1])
local limMin   = tonumber(ARGV[2])
local limHr    = tonumber(ARGV[3])
local limDay   = tonumber(ARGV[4])
local member   = ARGV[5]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - 86400000)

local cDay = tonumber(redis.call('ZCARD',  key))
local cHr  = tonumber(redis.call('ZCOUNT', key, now - 3600000, '+inf'))
local cMin = tonumber(redis.call('ZCOUNT', key, now - 60000,   '+inf'))

if cMin >= limMin then
  return {0, cMin, limMin, now + 60000, 'minute'}
end
if cHr >= limHr then
  return {0, cHr, limHr, now + 3600000, 'hour'}
end
if cDay >= limDay then
  return {0, cDay, limDay, now + 86400000, 'day'}
end

redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, 86401)
return {1, cMin + 1, limMin, now + 60000, 'none'}
`;

/**
 * Single-window sliding check (fixed endpoint limiter).
 *
 * KEYS[1]  = rate-limit key
 * ARGV[1]  = now (ms)
 * ARGV[2]  = limit
 * ARGV[3]  = windowMs
 * ARGV[4]  = ttlSec
 * ARGV[5]  = unique member
 *
 * Returns: {allowed(0|1), count, resetAt_ms(int)}
 */
const SINGLE_WINDOW_LUA = `
local key      = KEYS[1]
local now      = tonumber(ARGV[1])
local limit    = tonumber(ARGV[2])
local windowMs = tonumber(ARGV[3])
local ttlSec   = tonumber(ARGV[4])
local member   = ARGV[5]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - windowMs)
local count = tonumber(redis.call('ZCARD', key))

if count >= limit then
  return {0, count, now + windowMs}
end

redis.call('ZADD', key, now, member)
redis.call('EXPIRE', key, ttlSec)
return {1, count + 1, now + windowMs}
`;

// ── Result shapes ─────────────────────────────────────────────────────────────

interface MultiWindowResult {
  allowed: boolean;
  count: number;
  limit: number;
  resetAt: number; // ms epoch
  windowName: string;
}

interface SingleWindowResult {
  allowed: boolean;
  count: number;
  resetAt: number; // ms epoch
}

// ── In-memory fallback ────────────────────────────────────────────────────────

// Each entry is a sorted array of ms timestamps (ascending).
const memStore = new Map<string, number[]>();

// Periodically evict keys that hold only stale entries.
const memCleanupInterval = setInterval(() => {
  const cutoff = Date.now() - DAY_MS;
  for (const [key, ts] of memStore) {
    const fresh = ts.filter(t => t > cutoff);
    if (fresh.length === 0) {
      memStore.delete(key);
    } else {
      memStore.set(key, fresh);
    }
  }
}, 5 * 60_000).unref();

// Suppress "interval keeps process alive" warning in tests.
void memCleanupInterval;

function memMultiWindow(
  key: string,
  now: number,
  limits: WindowLimits
): MultiWindowResult {
  const all = (memStore.get(key) ?? []).filter(t => t > now - DAY_MS);

  const byMin = all.filter(t => t > now - MIN_MS);
  if (byMin.length >= limits.perMinute) {
    memStore.set(key, all);
    return { allowed: false, count: byMin.length, limit: limits.perMinute, resetAt: now + MIN_MS, windowName: 'minute' };
  }

  const byHr = all.filter(t => t > now - HR_MS);
  if (byHr.length >= limits.perHour) {
    memStore.set(key, all);
    return { allowed: false, count: byHr.length, limit: limits.perHour, resetAt: now + HR_MS, windowName: 'hour' };
  }

  if (all.length >= limits.perDay) {
    memStore.set(key, all);
    return { allowed: false, count: all.length, limit: limits.perDay, resetAt: now + DAY_MS, windowName: 'day' };
  }

  all.push(now);
  memStore.set(key, all);
  return { allowed: true, count: byMin.length + 1, limit: limits.perMinute, resetAt: now + MIN_MS, windowName: 'none' };
}

function memSingleWindow(
  key: string,
  now: number,
  windowMs: number,
  limit: number,
): SingleWindowResult {
  const fresh = (memStore.get(key) ?? []).filter(t => t > now - windowMs);

  if (fresh.length >= limit) {
    memStore.set(key, fresh);
    return { allowed: false, count: fresh.length, resetAt: now + windowMs };
  }

  fresh.push(now);
  memStore.set(key, fresh);
  return { allowed: true, count: fresh.length, resetAt: now + windowMs };
}

// ── Redis availability tracking ────────────────────────────────────────────────

let redisAvailable = true;
let recoveryTimer: ReturnType<typeof setInterval> | null = null;

function markRedisDown(): void {
  if (redisAvailable) {
    redisAvailable = false;
    logger.warn('rate_limiter_redis_unavailable', { message: 'Switching to in-memory fallback' });
  }
  if (recoveryTimer !== null) return;

  recoveryTimer = setInterval(() => {
    void (async () => {
      try {
        await redisClient.ping();
        redisAvailable = true;
        logger.info('rate_limiter_redis_recovered', { message: 'Switching back to Redis' });
        if (recoveryTimer !== null) {
          clearInterval(recoveryTimer);
          recoveryTimer = null;
        }
      } catch {
        // still down — keep probing
      }
    })();
  }, 30_000);

  recoveryTimer.unref();
}

// ── Redis eval helpers ─────────────────────────────────────────────────────────

function isRedisReady(): boolean {
  return redisAvailable && redisClient.status === 'ready';
}

async function evalMultiWindow(
  key: string,
  now: number,
  limits: WindowLimits,
  member: string
): Promise<MultiWindowResult> {
  try {
    const raw = await redisClient.eval(
      MULTI_WINDOW_LUA, 1, key,
      String(now),
      String(limits.perMinute),
      String(limits.perHour),
      String(limits.perDay),
      member
    ) as [number, number, number, number, string];

    return {
      allowed:    raw[0] === 1,
      count:      Number(raw[1]),
      limit:      Number(raw[2]),
      resetAt:    Number(raw[3]),
      windowName: String(raw[4]),
    };
  } catch (err) {
    markRedisDown();
    logger.warn('rate_limiter_redis_eval_failed', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return memMultiWindow(key, now, limits);
  }
}

async function evalSingleWindow(
  key: string,
  now: number,
  windowMs: number,
  ttlSec: number,
  limit: number,
  member: string
): Promise<SingleWindowResult> {
  try {
    const raw = await redisClient.eval(
      SINGLE_WINDOW_LUA, 1, key,
      String(now),
      String(limit),
      String(windowMs),
      String(ttlSec),
      member
    ) as [number, number, number];

    return {
      allowed: raw[0] === 1,
      count:   Number(raw[1]),
      resetAt: Number(raw[2]),
    };
  } catch (err) {
    markRedisDown();
    logger.warn('rate_limiter_redis_eval_failed', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return memSingleWindow(key, now, windowMs, limit);
  }
}

// ── Shared utilities ──────────────────────────────────────────────────────────

/** Extract the client IP, trusting only the first X-Forwarded-For hop. */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? 'unknown';
}

/** Set standard rate-limit headers on every response. */
function setRateLimitHeaders(
  res: Response,
  limit: number,
  remaining: number,
  resetAtMs: number,
  retryAfterSec?: number
): void {
  res.setHeader('X-RateLimit-Limit',     String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, remaining)));
  res.setHeader('X-RateLimit-Reset',     String(Math.ceil(resetAtMs / 1000)));
  if (retryAfterSec !== undefined) {
    res.setHeader('Retry-After', String(retryAfterSec));
  }
}

function build429Body(
  limit: number,
  resetAtMs: number,
  retryAfterSec: number,
  requestId: string
): object {
  return {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. Try again in ${retryAfterSec} seconds.`,
      retryAfter: retryAfterSec,
      limit,
      remaining: 0,
      resetAt: new Date(resetAtMs).toISOString(),
      requestId,
    },
  };
}

// ── Public middleware factories ────────────────────────────────────────────────

/**
 * Tier-aware sliding-window rate limiter.
 *
 * Reads `req.user.tier` (set by auth middleware) to select limits.
 * GET requests receive 2× the POST limits (cheaper operations).
 *
 * Scope key: `query` for POST, `query:get` for GET — kept separate so
 * users cannot exhaust their GET allowance with POST requests.
 */
export function createTierRateLimiter(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tier: TierKey  = (req.user?.tier as TierKey | undefined) ?? 'free';
    const isGet          = req.method === 'GET';
    const scope          = isGet ? 'q:get' : 'q:post';
    const base           = RATE_LIMITS[tier];

    const limits: WindowLimits = isGet
      ? { perMinute: base.perMinute * 2, perHour: base.perHour * 2, perDay: base.perDay * 2 }
      : base;

    const identifier = req.user?.id ?? getClientIp(req);
    const rlKey      = `tip:rl:${scope}:${identifier}`;
    const now        = Date.now();
    const member     = `${now}:${req.requestId ?? uuidv4()}`;

    let result: MultiWindowResult;
    if (isRedisReady()) {
      result = await evalMultiWindow(rlKey, now, limits, member);
    } else {
      result = memMultiWindow(rlKey, now, limits);
    }

    const remaining      = result.limit - result.count;
    const retryAfterSec  = Math.max(1, Math.ceil((result.resetAt - now) / 1000));

    setRateLimitHeaders(
      res, result.limit, remaining, result.resetAt,
      result.allowed ? undefined : retryAfterSec
    );

    if (!result.allowed) {
      const offenderKey = req.user?.id
        ? `user:${req.user.id.slice(0, 8)}`
        : `ip:${getClientIp(req)}`;
      trackRateLimitRejection(offenderKey);
      logger.warn('rate_limit_exceeded', {
        scope,
        tier,
        window: result.windowName,
        limit: result.limit,
        identifier: identifier.slice(0, 8),
      });
      fireAudit({
        userId:    req.user?.id,
        action:    'rate_limit_exceeded',
        resource:  `${req.method} ${req.path}`,
        details:   { scope, tier, window: result.windowName, limit: result.limit },
        ipAddress: getClientIp(req),
        userAgent: (req.headers['user-agent'] ?? '').slice(0, 200),
        requestId: req.requestId ?? 'unknown',
        outcome:   'denied',
      });
      res.status(429).json(
        build429Body(result.limit, result.resetAt, retryAfterSec, req.requestId ?? 'unknown')
      );
      return;
    }

    next();
  };
}

/**
 * Fixed sliding-window rate limiter for a single minute window.
 *
 * Designed for auth endpoints where we limit per IP regardless of auth state.
 *
 * @param perMinute  Maximum requests per 60-second sliding window.
 * @param scope      Short string that namespaces the Redis key (e.g. 'login').
 */
export function createFixedRateLimiter(perMinute: number, scope: string): RequestHandler {
  const windowMs = MIN_MS;
  const ttlSec   = 61; // slightly more than 1 window

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifier = getClientIp(req);
    const rlKey      = `tip:rl:${scope}:${identifier}`;
    const now        = Date.now();
    const member     = `${now}:${req.requestId ?? uuidv4()}`;

    let result: SingleWindowResult;
    if (isRedisReady()) {
      result = await evalSingleWindow(rlKey, now, windowMs, ttlSec, perMinute, member);
    } else {
      result = memSingleWindow(rlKey, now, windowMs, perMinute);
    }

    const remaining     = perMinute - result.count;
    const retryAfterSec = Math.max(1, Math.ceil((result.resetAt - now) / 1000));

    setRateLimitHeaders(
      res, perMinute, remaining, result.resetAt,
      result.allowed ? undefined : retryAfterSec
    );

    if (!result.allowed) {
      trackRateLimitRejection(`ip:${identifier}`);
      logger.warn('rate_limit_exceeded', {
        scope,
        identifier: identifier.slice(0, 16),
        limit: perMinute,
      });
      fireAudit({
        action:    'rate_limit_exceeded',
        resource:  `${req.method} ${req.path}`,
        details:   { scope, limit: perMinute },
        ipAddress: getClientIp(req),
        userAgent: (req.headers['user-agent'] ?? '').slice(0, 200),
        requestId: req.requestId ?? 'unknown',
        outcome:   'denied',
      });
      res.status(429).json(
        build429Body(perMinute, result.resetAt, retryAfterSec, req.requestId ?? 'unknown')
      );
      return;
    }

    next();
  };
}
