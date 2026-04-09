/**
 * Proactive feed health checker.
 *
 * Every 5 minutes, for each feed whose circuit is OPEN, this service sends a
 * direct test query bypassing the circuit breaker.  If the feed responds
 * successfully the circuit is forced to CLOSED (auto-recovered).  If it fails
 * the state is left unchanged — the normal circuit breaker timer continues.
 *
 * This supplements the reactive half-open probe (which only triggers on the
 * next real user query) with a proactive check that works even during low
 * traffic.
 */

import { abuseIPDBFeed }    from '../feeds/abuseIPDB';
import { BaseFeed }          from '../feeds/baseFeed';
import { getCircuitState, resetCircuit } from '../feeds/circuitBreaker';
import { ipInfoFeed }        from '../feeds/ipInfo';
import { shodanFeed }        from '../feeds/shodan';
import { virusTotalFeed }    from '../feeds/virusTotal';
import { systemState }       from './systemState';
import logger                from '../utils/logger';

// ── Constants ─────────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 5 * 60_000; // every 5 minutes
const TEST_IOC          = '8.8.8.8';
const TEST_TYPE         = 'ip' as const;

// Only IP-capable feeds participate in the auto-recovery probe.
// AbstractEmail only supports email — it would always return 'unsupported'.
const IP_FEEDS: BaseFeed[] = [virusTotalFeed, abuseIPDBFeed, shodanFeed, ipInfoFeed];

// ── Recovery probe ────────────────────────────────────────────────────────────

async function probeOneFeed(feed: BaseFeed): Promise<void> {
  const state = await getCircuitState(feed.name);
  if (state !== 'OPEN') return; // only probe feeds that are actually down

  logger.info('feed_auto_recovery_check', { feedName: feed.name, circuitState: state });

  if (!feed.isEnabled()) {
    logger.info('feed_auto_recovery_skip_disabled', { feedName: feed.name });
    return;
  }

  try {
    // Call the feed directly — bypasses circuit breaker so we don't interfere
    // with its state machine until we have a definitive result.
    const result = await feed.query(TEST_IOC, TEST_TYPE);

    if (result.status === 'success') {
      await resetCircuit(feed.name);
      systemState.setFeedHealth(feed.name, true);
      logger.info('feed_auto_recovered', {
        feedName:  feed.name,
        latencyMs: result.latencyMs,
      });
    } else {
      systemState.setFeedHealth(feed.name, false);
      logger.info('feed_still_down', {
        feedName: feed.name,
        status:   result.status,
        error:    result.error,
      });
    }
  } catch (err) {
    systemState.setFeedHealth(feed.name, false);
    logger.warn('feed_auto_recovery_probe_error', {
      feedName: feed.name,
      error:    err instanceof Error ? err.message : 'unknown',
    });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startFeedAutoRecovery(): void {
  const interval = setInterval(() => {
    void (async () => {
      // Skip probe when Redis is down — circuit state can't be read reliably
      if (!systemState.isRedisHealthy()) {
        logger.info('feed_auto_recovery_skip_redis_down');
        return;
      }

      await Promise.allSettled(IP_FEEDS.map(probeOneFeed));
    })();
  }, CHECK_INTERVAL_MS);

  interval.unref();
  logger.info('feed_auto_recovery_started', { intervalMs: CHECK_INTERVAL_MS, feeds: IP_FEEDS.map(f => f.name) });
}
