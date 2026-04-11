import Redis from 'ioredis';
import {
  Pool,
  PoolClient,
  QueryResult,
  QueryResultRow
} from 'pg';
import { systemState } from '../services/systemState';
import logger from '../utils/logger';

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/threat_intel';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

const TRANSIENT_PG_ERROR_CODES = new Set(['57P01', '40001', '40P01']);

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const getErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
};

export class DatabaseError extends Error {
  public readonly code?: string;
  public readonly originalError?: unknown;

  constructor(message: string, options?: { code?: string; originalError?: unknown }) {
    super(message);
    this.name = 'DatabaseError';
    this.code = options?.code;
    this.originalError = options?.originalError;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DatabaseError);
    }
  }
}

// ── PostgreSQL pool ───────────────────────────────────────────────────────────

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// ── DB degraded-mode tracking ─────────────────────────────────────────────────

let consecutiveDbFailures = 0;
let isDbDegraded          = false;
let dbRecoveryTimer:      NodeJS.Timeout | null = null;

const DB_DEGRADED_THRESHOLD  = 10;
const DB_RECOVERY_INTERVAL_MS = 15_000;

function startDbRecovery(): void {
  if (dbRecoveryTimer) return; // already running
  dbRecoveryTimer = setInterval(() => {
    void (async () => {
      try {
        await pool.query('SELECT 1');
        // Recovered — clear degraded state
        isDbDegraded          = false;
        consecutiveDbFailures = 0;
        systemState.setDbHealth(true);
        if (dbRecoveryTimer) { clearInterval(dbRecoveryTimer); dbRecoveryTimer = null; }
      } catch {
        // Still down — systemState emits CRITICAL log every 30 s independently
      }
    })();
  }, DB_RECOVERY_INTERVAL_MS);
  dbRecoveryTimer.unref();
}

function enterDbDegradedMode(): void {
  if (isDbDegraded) return;
  isDbDegraded = true;
  systemState.setDbHealth(false);
  startDbRecovery();
}

/** True when the database is unreachable and all DB operations are fast-failing. */
export function isDatabaseDegraded(): boolean {
  return isDbDegraded;
}

pool.on('error', (error: Error) => {
  logger.error('pg_pool_error', { error: error.message });
  consecutiveDbFailures++;
  if (consecutiveDbFailures >= DB_DEGRADED_THRESHOLD) {
    enterDbDegradedMode();
  }
});

// ── Redis client ──────────────────────────────────────────────────────────────

export const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 0,
  enableOfflineQueue: false,
  retryStrategy: (times: number): number => {
    // Never give up — cap at 30 s backoff so we don't spam logs.
    // The 'reconnecting' event keeps systemState informed.
    if (times % 10 === 0) {
      logger.warn('redis_reconnect_retrying', { attempts: times });
    }
    return Math.min(100 * 2 ** Math.min(times - 1, 8), 30_000); // max 30 s
  },
});

// ── Redis health tracking ─────────────────────────────────────────────────────

redis.on('ready', () => {
  systemState.setRedisHealth(true);
});

redis.on('close', () => {
  // 'close' fires when the connection is fully lost (after retries exhausted or clean disconnect)
  systemState.setRedisHealth(false);
});

redis.on('reconnecting', () => {
  // Connection was lost and ioredis is trying to reconnect — treat as degraded
  systemState.setRedisHealth(false);
});

redis.on('error', (error: Error) => {
  logger.warn('redis_client_error', { error: error.message });
  // Don't call setRedisHealth(false) here — transient errors during operation
  // don't mean the connection is gone. 'close'/'reconnecting' handle that.
});

// ── DB query with degraded-mode fast-fail ─────────────────────────────────────

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  retries = 3
): Promise<QueryResult<T>> {
  // Fast-fail when DB is known to be down — avoids connection timeout pile-up
  if (isDbDegraded) {
    throw new DatabaseError(
      'Database unavailable — service is operating in degraded mode',
      { code: 'DB_DEGRADED' }
    );
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const result = await pool.query<T>(sql, params);
      // Success — reset failure counter
      if (consecutiveDbFailures > 0) consecutiveDbFailures = 0;
      return result;
    } catch (error) {
      const code           = getErrorCode(error);
      const isTransient    = typeof code === 'string' && TRANSIENT_PG_ERROR_CODES.has(code);
      const hasAttemptsLeft = attempt < retries;

      if (isTransient && hasAttemptsLeft) {
        const delayMs = 100 * 2 ** attempt;
        logger.warn('pg_transient_error_retry', {
          code, attempt: attempt + 1, retries, delayMs,
        });
        await sleep(delayMs);
        continue;
      }

      // Count connection errors (no SQL state code = network / connection failure)
      if (!code) {
        consecutiveDbFailures++;
        if (consecutiveDbFailures >= DB_DEGRADED_THRESHOLD) {
          enterDbDegradedMode();
        }
      }

      throw new DatabaseError('Database query failed', { code, originalError: error });
    }
  }

  throw new DatabaseError('Database query failed after retries exhausted');
}

// ── Transaction helper ────────────────────────────────────────────────────────

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (isDbDegraded) {
    throw new DatabaseError(
      'Database unavailable — service is operating in degraded mode',
      { code: 'DB_DEGRADED' }
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore rollback error */ }

    const code = getErrorCode(error);
    if (!code) {
      // Connection-level failure — count it
      consecutiveDbFailures++;
      if (consecutiveDbFailures >= DB_DEGRADED_THRESHOLD) {
        enterDbDegradedMode();
      }
    }
    throw error;
  } finally {
    client.release();
  }
}

// ── Redis connection helper ───────────────────────────────────────────────────

let redisConnectInFlight: Promise<void> | null = null;

export async function ensureRedisConnection(): Promise<void> {
  if (redis.status === 'ready' || redis.status === 'connecting') return;

  if (!redisConnectInFlight) {
    redisConnectInFlight = redis
      .connect()
      .then(() => undefined)
      .catch((error: unknown) => {
        logger.warn('redis_connect_failed', {
          error: error instanceof Error ? error.message : 'unknown',
        });
        throw error;
      })
      .finally(() => {
        redisConnectInFlight = null;
      });
  }

  await redisConnectInFlight;
}

// ── Shutdown helper ───────────────────────────────────────────────────────────

const closeRedis = async (): Promise<void> => {
  if (redis.status === 'end') return;
  try {
    await redis.quit();
  } catch (error) {
    logger.warn('redis_quit_failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    redis.disconnect(false);
  }
};

export async function closeConnections(): Promise<void> {
  if (dbRecoveryTimer) { clearInterval(dbRecoveryTimer); dbRecoveryTimer = null; }
  await Promise.allSettled([pool.end(), closeRedis()]);
}

// ── Legacy aliases (keep for compatibility) ───────────────────────────────────

export const pgPool      = pool;
export const redisClient = redis;
