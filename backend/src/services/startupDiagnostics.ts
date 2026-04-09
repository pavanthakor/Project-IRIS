/**
 * Startup diagnostics — runs once on server boot.
 *
 * Tests every infrastructure dependency, logs feed API-key presence (never the
 * value), reports system memory, and emits a single structured INFO record so
 * the startup state is captured in the log stream.
 */

import os from 'node:os';
import { pool, redis } from '../config/database';
import config from '../config';
import logger from '../utils/logger';

const FEED_KEY_ENV: Array<{ name: string; envKey: string; enabledEnv: string }> = [
  { name: 'VirusTotal',    envKey: 'VIRUSTOTAL_API_KEY',    enabledEnv: 'FEED_VIRUSTOTAL_ENABLED'    },
  { name: 'AbuseIPDB',     envKey: 'ABUSEIPDB_API_KEY',     enabledEnv: 'FEED_ABUSEIPDB_ENABLED'     },
  { name: 'Shodan',        envKey: 'SHODAN_API_KEY',        enabledEnv: 'FEED_SHODAN_ENABLED'        },
  { name: 'IPInfo',        envKey: 'IPINFO_API_KEY',        enabledEnv: 'FEED_IPINFO_ENABLED'        },
  { name: 'AbstractEmail', envKey: 'ABSTRACT_EMAIL_API_KEY',enabledEnv: 'FEED_ABSTRACTEMAIL_ENABLED' },
];

async function testDb(): Promise<'ok' | 'failed'> {
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 3_000)
      ),
    ]);
    return 'ok';
  } catch {
    return 'failed';
  }
}

async function testRedis(): Promise<'ok' | 'failed'> {
  try {
    const reply = await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 3_000)
      ),
    ]);
    return reply === 'PONG' ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}

export async function runStartupDiagnostics(): Promise<void> {
  const [dbStatus, redisStatus] = await Promise.all([testDb(), testRedis()]);

  const feedStatus = FEED_KEY_ENV.map(f => ({
    name:    f.name,
    keyPresent: !!process.env[f.envKey],
    enabled:    process.env[f.enabledEnv] !== 'false',
  }));

  const totalMB = Math.round(os.totalmem()  / 1_048_576);
  const freeMB  = Math.round(os.freemem()   / 1_048_576);
  const usedPct = Math.round((1 - os.freemem() / os.totalmem()) * 100);

  // ── Startup banner ────────────────────────────────────────────────────────
  logger.info('startup_diagnostics', {
    nodeVersion:       process.version,
    compilationStatus: 'ok',       // process is running → compiled successfully
    environment:       config.nodeEnv,
    port:              config.port,
    database:          dbStatus,
    redis:             redisStatus,
    memory: {
      totalMB,
      freeMB,
      usedPct,
    },
    feeds: Object.fromEntries(
      feedStatus.map(f => [
        f.name,
        { keyPresent: f.keyPresent, enabled: f.enabled },
      ])
    ),
    security: {
      jwtSecretIsDefault: config.jwtSecret === 'dev-secret-change-in-production',
      corsOrigin:         config.corsOrigin,
    },
  });

  // ── Per-feed warnings ─────────────────────────────────────────────────────
  for (const f of feedStatus) {
    if (f.enabled && !f.keyPresent) {
      logger.warn('feed_api_key_missing', {
        feedName: f.name,
        hint:     `Set ${FEED_KEY_ENV.find(e => e.name === f.name)?.envKey ?? ''} in .env`,
      });
    }
  }

  // ── Infrastructure warnings ───────────────────────────────────────────────
  if (dbStatus === 'failed') {
    logger.error('startup_db_unavailable', {
      message: 'PostgreSQL did not respond to SELECT 1 — queries will fail',
    });
  }
  if (redisStatus === 'failed') {
    logger.error('startup_redis_unavailable', {
      message: 'Redis did not respond to PING — rate limiting and caching will use in-memory fallbacks',
    });
  }
  if (config.nodeEnv === 'development' && config.jwtSecret === 'dev-secret-change-in-production') {
    logger.warn('startup_insecure_jwt_secret', {
      message: 'JWT_SECRET is using the default development value — set a strong secret before deploying',
    });
  }
}
