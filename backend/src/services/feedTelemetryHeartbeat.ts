import { abuseIPDBFeed } from '../feeds/abuseIPDB';
import { BaseFeed } from '../feeds/baseFeed';
import { getCircuitState, recordLatency } from '../feeds/circuitBreaker';
import { ipInfoFeed } from '../feeds/ipInfo';
import { shodanFeed } from '../feeds/shodan';
import { virusTotalFeed } from '../feeds/virusTotal';
import { zeroBounceFeed } from '../feeds/zeroBounce';
import { recordFeedOutcome, getFeedHealth } from './feedHealthService';
import { checkSlowFeed, trackFeedOutcome } from './metricsService';
import logger from '../utils/logger';

const HEARTBEAT_INTERVAL_MS = 90_000;
const MIN_PROBE_GAP_MS = 15 * 60_000;

const FEED_PROBES: Array<{ feed: BaseFeed; ioc: string; type: 'ip' | 'email' }> = [
  { feed: virusTotalFeed, ioc: '8.8.8.8', type: 'ip' },
  { feed: abuseIPDBFeed, ioc: '8.8.8.8', type: 'ip' },
  { feed: shodanFeed, ioc: '8.8.8.8', type: 'ip' },
  { feed: ipInfoFeed, ioc: '8.8.8.8', type: 'ip' },
  { feed: zeroBounceFeed, ioc: 'support@github.com', type: 'email' },
];

const lastProbeAt = new Map<string, number>();

function shouldMarkSuccess(status: string): boolean {
  return status === 'success';
}

async function probeFeed(feed: BaseFeed, ioc: string, type: 'ip' | 'email'): Promise<void> {
  const start = Date.now();

  try {
    const result = await feed.query(ioc, type);
    const latencyMs = Math.max(1, Date.now() - start);
    const success = shouldMarkSuccess(result.status);

    await recordLatency(feed.name, latencyMs);
    recordFeedOutcome(feed.name, success ? 'success' : 'failure', latencyMs);
    trackFeedOutcome(feed.name, success);
    checkSlowFeed(feed.name);

    logger.info('feed_telemetry_heartbeat_sampled', {
      feedName: feed.name,
      status: result.status,
      latencyMs,
    });
  } catch (error) {
    const latencyMs = Math.max(1, Date.now() - start);
    await recordLatency(feed.name, latencyMs);
    recordFeedOutcome(feed.name, 'failure', latencyMs);
    trackFeedOutcome(feed.name, false);

    logger.warn('feed_telemetry_heartbeat_error', {
      feedName: feed.name,
      latencyMs,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

async function runHeartbeatPass(): Promise<void> {
  for (const probe of FEED_PROBES) {
    const { feed, ioc, type } = probe;

    if (!feed.isEnabled() || !feed.supportsType(type)) {
      continue;
    }

    const now = Date.now();
    const lastAt = lastProbeAt.get(feed.name) ?? 0;

    if (now - lastAt < MIN_PROBE_GAP_MS) {
      continue;
    }

    const state = await getCircuitState(feed.name);
    const metrics = await getFeedHealth(feed.name).catch(() => null);
    const hasRecentTraffic = (metrics?.requestsLastHour ?? 0) > 0 && (metrics?.avgLatencyMs ?? 0) > 0;

    if (state === 'OPEN' || hasRecentTraffic) {
      continue;
    }

    await probeFeed(feed, ioc, type);
    lastProbeAt.set(feed.name, now);
  }
}

export function startFeedTelemetryHeartbeat(): void {
  const interval = setInterval(() => {
    void runHeartbeatPass();
  }, HEARTBEAT_INTERVAL_MS);

  interval.unref();
  void runHeartbeatPass();

  logger.info('feed_telemetry_heartbeat_started', {
    intervalMs: HEARTBEAT_INTERVAL_MS,
    minProbeGapMs: MIN_PROBE_GAP_MS,
    feeds: FEED_PROBES.map((p) => p.feed.name),
  });
}
