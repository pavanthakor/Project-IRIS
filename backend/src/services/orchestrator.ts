import { abuseIPDBFeed } from '../feeds/abuseIPDB';
import { abstractEmailFeed } from '../feeds/abstractEmail';
import { BaseFeed } from '../feeds/baseFeed';
import { queryWithCircuitBreaker } from '../feeds/circuitBreaker';
import { ipInfoFeed } from '../feeds/ipInfo';
import { shodanFeed } from '../feeds/shodan';
import { virusTotalFeed } from '../feeds/virusTotal';
import { FeedResult, IoCType } from '../types';
import logger from '../utils/logger';

type FeedRejection = {
  readonly feedName?: string;
  readonly message?: string;
};

export const ALL_FEEDS: BaseFeed[] = [
  virusTotalFeed,
  abuseIPDBFeed,
  shodanFeed,
  ipInfoFeed,
  abstractEmailFeed
];

export const maskIoC = (ioc: string): string => {
  const normalized = ioc.trim();

  if (!normalized) {
    return '';
  }

  if (normalized.length <= 4) {
    return '*'.repeat(normalized.length);
  }

  const startLen = 2;
  const endLen = 2;
  const middleLen = Math.max(1, normalized.length - startLen - endLen);

  return `${normalized.slice(0, startLen)}${'*'.repeat(middleLen)}${normalized.slice(-endLen)}`;
};



export interface DisabledFeedStat {
  readonly name: string;
  readonly status: 'disabled' | 'unsupported';
}

export async function orchestrateQuery(
  ioc: string,
  type: IoCType
): Promise<{ feeds: FeedResult[]; disabledFeeds: DisabledFeedStat[]; durationMs: number }> {
  const start = Date.now();
  const normalizedIoc = ioc.trim();

  const eligibleFeeds = ALL_FEEDS.filter(
    (feed) => feed.supportsType(type) && feed.isEnabled()
  );

  const disabledFeeds: DisabledFeedStat[] = ALL_FEEDS
    .filter(feed => !feed.supportsType(type) || !feed.isEnabled())
    .map(feed => ({
      name: feed.name,
      status: (!feed.isEnabled() ? 'disabled' : 'unsupported') as 'disabled' | 'unsupported',
    }));

  if (eligibleFeeds.length === 0) {
    logger.warn('orchestrator_no_eligible_feeds', {
      ioc: maskIoC(normalizedIoc),
      type
    });

    return {
      feeds: [],
      disabledFeeds,
      durationMs: 0
    };
  }

  const promises = eligibleFeeds.map((feed) =>
    queryWithCircuitBreaker(feed, normalizedIoc, type).catch((err: unknown) => {
      // Re-throw with feed name for context in Promise.allSettled
      const message = err instanceof Error ? err.message : 'unknown feed failure';
      throw { feedName: feed.name, message } as FeedRejection;
    })
  );

  const settled = await Promise.allSettled(promises);

  const feeds: FeedResult[] = settled.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }

    const reason = result.reason as FeedRejection;
    const fallbackFeedName = eligibleFeeds[i]?.name ?? 'unknown';

    // Now we have the feed name in the rejection reason
    const feedName = reason.feedName ?? fallbackFeedName;
    const error = reason.message ?? 'unknown feed failure';

    return {
      status: 'failed',
      feedName,
      error,
      latencyMs: 0,
    };
  });

  const durationMs = Math.max(0, Date.now() - start);
  const successCount = feeds.filter((feed) => feed.status === 'success').length;
  const failCount = feeds.length - successCount;

  logger.info('orchestrator_complete', {
    ioc: maskIoC(normalizedIoc),
    type,
    feedCount: feeds.length,
    successCount,
    failCount,
    durationMs
  });

  return {
    feeds,
    disabledFeeds,
    durationMs
  };
}