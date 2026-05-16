import { Router } from 'express';
import { getAbuseIPDBQuotaSnapshot } from '../feeds/abuseIPDB';
import { ensureRedisConnection, pool, redisClient, isDatabaseDegraded } from '../config/database';
import { getZeroBounceQuotaSnapshot } from '../feeds/zeroBounce';
import { getCacheStats } from '../services/cache';
import { getAllFeedHealth } from '../services/feedHealthService';
import { systemState } from '../services/systemState';

const router = Router();

const HEALTH_TIMEOUT_MS = 3_000;
const VERSION = '1.0.0' as const;

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';
type FeedHealth = 'healthy' | 'circuit_open' | 'disabled';
type HealthStatus = 'ok' | 'degraded';

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('timeout'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const checkDb = async (): Promise<ConnectionStatus> => {
  // If the DB recovery loop is running we know it's down — no need to probe
  if (isDatabaseDegraded()) return 'reconnecting';
  try {
    await withTimeout(pool.query('SELECT 1'), HEALTH_TIMEOUT_MS);
    return 'connected';
  } catch {
    return 'disconnected';
  }
};

const checkRedis = async (): Promise<ConnectionStatus> => {
  try {
    await withTimeout(
      ensureRedisConnection().then(() => redisClient.ping()),
      HEALTH_TIMEOUT_MS
    );
    return 'connected';
  } catch {
    return 'disconnected';
  }
};

const isFeedDisabled = (envValue: string | undefined): boolean =>
  envValue?.toLowerCase() === 'false';

const FEEDS = [
  { label: 'VirusTotal', feedName: 'VirusTotal', enabledEnv: 'FEED_VIRUSTOTAL_ENABLED' },
  { label: 'AbuseIPDB', feedName: 'AbuseIPDB', enabledEnv: 'FEED_ABUSEIPDB_ENABLED' },
  { label: 'Shodan', feedName: 'Shodan', enabledEnv: 'FEED_SHODAN_ENABLED' },
  { label: 'IPInfo', feedName: 'IPInfo', enabledEnv: 'FEED_IPINFO_ENABLED' },
  { label: 'ZeroBounce', feedName: 'ZeroBounce', enabledEnv: 'FEED_ZEROBOUNCE_ENABLED' },
  { label: 'AlienVault OTX', feedName: 'AlienVault OTX', enabledEnv: 'FEED_ALIENVAULT_OTX_ENABLED' }
] as const;

const getFeedHealth = async (
  feed: (typeof FEEDS)[number],
  redisConnected: boolean
): Promise<FeedHealth> => {
  if (isFeedDisabled(process.env[feed.enabledEnv])) {
    return 'disabled';
  }

  if (!redisConnected) {
    return 'healthy';
  }

  try {
    const value = await withTimeout(
      redisClient.get(`tip:cb:${feed.feedName}`),
      HEALTH_TIMEOUT_MS
    );

    return value === 'OPEN' ? 'circuit_open' : 'healthy';
  } catch {
    return 'healthy';
  }
};

router.get('/', async (_req, res) => {
  try {
    const [db, redisStatus] = await Promise.all([checkDb(), checkRedis()]);
    const redisConnected = redisStatus === 'connected';

    const [feedEntries, cacheStats, feedHealth, zeroBounceQuota, abuseIpDbQuota] = await Promise.all([
      Promise.all(
        FEEDS.map(async (feed) => [feed.label, await getFeedHealth(feed, redisConnected)] as const)
      ),
      redisConnected ? getCacheStats().catch(() => null) : Promise.resolve(null),
      redisConnected ? getAllFeedHealth().catch(() => null) : Promise.resolve(null),
      getZeroBounceQuotaSnapshot().catch(() => ({
        remaining: null,
        total: 100,
        updatedAt: null,
        source: 'unknown' as const,
      })),
      getAbuseIPDBQuotaSnapshot().catch(() => ({
        remaining: null,
        total: 1000,
        updatedAt: null,
        source: 'unknown' as const,
      })),
    ]);

    const feeds = Object.fromEntries(feedEntries) as Record<string, FeedHealth>;

    const overallStatus = systemState.getOverallStatus();
    const status: HealthStatus = overallStatus === 'healthy' ? 'ok' : 'degraded';

    res.status(200).json({
      status,
      overall: overallStatus,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      db,
      redis: redisStatus,
      feeds: {
        VirusTotal:    feeds.VirusTotal    ?? 'healthy',
        AbuseIPDB:     feeds.AbuseIPDB     ?? 'healthy',
        Shodan:        feeds.Shodan        ?? 'healthy',
        IPInfo:        feeds.IPInfo        ?? 'healthy',
        ZeroBounce:    feeds.ZeroBounce    ?? 'healthy',
        'AlienVault OTX': feeds['AlienVault OTX'] ?? 'healthy',
      },
      cache:      cacheStats ?? { hits: 0, misses: 0, errors: 0, bgRefreshes: 0, hitRate: 0 },
      feedHealth: feedHealth ?? {},
      quota: {
        AbuseIPDB: abuseIpDbQuota,
        ZeroBounce: zeroBounceQuota,
      },
      version:    VERSION,
    });
  } catch {
    const fallbackFeeds = {
      VirusTotal: isFeedDisabled(process.env.FEED_VIRUSTOTAL_ENABLED) ? 'disabled' : 'healthy',
      AbuseIPDB: isFeedDisabled(process.env.FEED_ABUSEIPDB_ENABLED) ? 'disabled' : 'healthy',
      Shodan: isFeedDisabled(process.env.FEED_SHODAN_ENABLED) ? 'disabled' : 'healthy',
      IPInfo: isFeedDisabled(process.env.FEED_IPINFO_ENABLED) ? 'disabled' : 'healthy',
      ZeroBounce: isFeedDisabled(process.env.FEED_ZEROBOUNCE_ENABLED) ? 'disabled' : 'healthy',
      'AlienVault OTX': isFeedDisabled(process.env.FEED_ALIENVAULT_OTX_ENABLED) ? 'disabled' : 'healthy'
    } satisfies Record<string, FeedHealth>;

    res.status(200).json({
      status: 'degraded',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      db: 'disconnected',
      redis: 'disconnected',
      feeds: fallbackFeeds,
      quota: {
        AbuseIPDB: {
          remaining: null,
          total: 1000,
          updatedAt: null,
          source: 'unknown' as const,
        },
        ZeroBounce: {
          remaining: null,
          total: 100,
          updatedAt: null,
          source: 'unknown' as const,
        },
      },
      version: VERSION
    });
  }
});

export default router;