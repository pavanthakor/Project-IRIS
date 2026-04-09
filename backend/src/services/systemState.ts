/**
 * Singleton system-state manager.
 *
 * Tracks the health of DB, Redis, feeds, and memory pressure.
 * All other services write into this module; consumers (health route, query
 * route, metrics) read from it.  No async I/O — synchronous only.
 *
 * Dependency direction:
 *   database.ts  ──►  systemState  (sets DB / Redis health)
 *   metricsService  ►  systemState  (sets memory pressure)
 *   circuitBreaker  ►  systemState  (sets feed health)
 *   health route    ►  systemState  (reads overall status)
 *   query route     ►  systemState  (reads 503 gate + systemStatus)
 */

import logger from '../utils/logger';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MemoryPressureLevel = 'normal' | 'warn' | 'critical';
export type OverallStatus       = 'healthy' | 'degraded' | 'critical';

interface FeedState {
  healthy:   boolean;
  lastCheck: number;
}

// ── Singleton class ───────────────────────────────────────────────────────────

class SystemStateManager {
  private dbHealthy:      boolean             = true;
  private redisHealthy:   boolean             = true;
  private memPressure:    MemoryPressureLevel = 'normal';
  private feedStates:     Map<string, FeedState> = new Map();

  // Periodic CRITICAL log timers (one per degraded subsystem)
  private dbCriticalTimer:    NodeJS.Timeout | null = null;
  private redisCriticalTimer: NodeJS.Timeout | null = null;

  // ── Writers ───────────────────────────────────────────────────────────────

  setDbHealth(healthy: boolean): void {
    if (this.dbHealthy === healthy) return;
    this.dbHealthy = healthy;

    if (!healthy) {
      logger.error('system_db_degraded', {
        message: 'Database unavailable — queries will continue without history persistence',
      });
      if (!this.dbCriticalTimer) {
        this.dbCriticalTimer = setInterval(() => {
          logger.error('db_still_unavailable', {
            message: 'Database still unavailable. Recovery check running every 15 s.',
          });
        }, 30_000);
        this.dbCriticalTimer.unref();
      }
    } else {
      if (this.dbCriticalTimer) {
        clearInterval(this.dbCriticalTimer);
        this.dbCriticalTimer = null;
      }
      logger.info('db_recovered', { message: 'Database connection restored' });
    }
  }

  setRedisHealth(healthy: boolean): void {
    if (this.redisHealthy === healthy) return;
    this.redisHealthy = healthy;

    if (!healthy) {
      logger.error('system_redis_degraded', {
        message: 'Redis unavailable — cache disabled, rate-limiting falls back to in-memory, circuits fail-open',
      });
      if (!this.redisCriticalTimer) {
        this.redisCriticalTimer = setInterval(() => {
          logger.error('redis_still_unavailable', {
            message: 'Redis still unavailable. ioredis is attempting reconnection.',
          });
        }, 30_000);
        this.redisCriticalTimer.unref();
      }
    } else {
      if (this.redisCriticalTimer) {
        clearInterval(this.redisCriticalTimer);
        this.redisCriticalTimer = null;
      }
      logger.info('redis_recovered', { message: 'Redis connection restored' });
    }
  }

  setFeedHealth(feedName: string, healthy: boolean): void {
    this.feedStates.set(feedName, { healthy, lastCheck: Date.now() });
  }

  setMemoryPressure(level: MemoryPressureLevel): void {
    if (this.memPressure === level) return;
    this.memPressure = level;
  }

  // ── Readers ───────────────────────────────────────────────────────────────

  isDbHealthy():       boolean             { return this.dbHealthy;    }
  isRedisHealthy():    boolean             { return this.redisHealthy; }
  isMemoryCritical():  boolean             { return this.memPressure === 'critical'; }
  getMemoryPressure(): MemoryPressureLevel { return this.memPressure;  }

  /**
   * Cache TTL multiplier.  0.5 under any memory pressure, 1 when normal.
   * Applied in setCachedResult to free memory faster.
   */
  getCacheTtlMultiplier(): number {
    return this.memPressure !== 'normal' ? 0.5 : 1;
  }

  /**
   * overall = 'critical'  → DB AND Redis both down (core functionality at risk)
   * overall = 'degraded'  → one subsystem down (queries still work, degraded)
   * overall = 'healthy'   → everything up
   */
  getOverallStatus(): OverallStatus {
    if (!this.dbHealthy && !this.redisHealthy) return 'critical';
    if (!this.dbHealthy || !this.redisHealthy || this.memPressure === 'critical') return 'degraded';
    const unhealthyFeeds = [...this.feedStates.values()].filter(f => !f.healthy);
    if (unhealthyFeeds.length > 0) return 'degraded';
    return 'healthy';
  }

  /**
   * Human-readable capability limitations, shown in the `systemStatus` response
   * field so clients know what's unavailable.
   */
  getDegradedCapabilities(): string[] {
    const out: string[] = [];
    if (!this.redisHealthy) {
      out.push('Cache unavailable — results may be slower');
      out.push('Rate limiting is approximate (in-memory fallback active)');
    }
    if (!this.dbHealthy) {
      out.push('Query history temporarily unavailable');
      out.push('Webhook delivery temporarily unavailable');
    }
    if (this.memPressure === 'warn') {
      out.push('Cache TTLs reduced due to memory pressure');
    }
    if (this.memPressure === 'critical') {
      out.push('Service overloaded — some requests may be rejected (503)');
    }
    return out;
  }
}

// Export the singleton
export const systemState = new SystemStateManager();
