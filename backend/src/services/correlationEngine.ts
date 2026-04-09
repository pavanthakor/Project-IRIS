import { FeedResult, RiskLevel, Verdict, GeoLocation } from '../types';

export interface CorrelationResult {
  readonly riskScore: number;
  readonly riskLevel: RiskLevel;
  readonly verdict: Verdict;
  readonly tags: readonly string[];
  readonly geoLocation?: GeoLocation;
}

const isUsefulFeed = (feed: FeedResult): boolean =>
  feed.status === 'success' || feed.status === 'cached';

const scoreFromFeed = (feed: FeedResult): number => {
  if (!isUsefulFeed(feed)) {
    return 0;
  }

  if (typeof feed.confidenceScore === 'number') {
    return clamp(feed.confidenceScore, 0, 100);
  }

  if (
    typeof feed.detections === 'number' &&
    typeof feed.totalEngines === 'number' &&
    feed.totalEngines > 0
  ) {
    return clamp(Math.round((feed.detections / feed.totalEngines) * 100), 0, 100);
  }

  return 0;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const riskLevelFromScore = (riskScore: number): RiskLevel => {
  if (!Number.isFinite(riskScore) || riskScore < 0) {
    return 'UNKNOWN';
  }

  if (riskScore >= 80) {
    return 'CRITICAL';
  }
  if (riskScore >= 60) {
    return 'HIGH';
  }
  if (riskScore >= 40) {
    return 'MEDIUM';
  }
  if (riskScore > 0) {
    return 'LOW';
  }
  if (riskScore === 0) {
    return 'NONE';
  }

  return 'UNKNOWN';
};

export const verdictFromRiskLevel = (riskLevel: RiskLevel): Verdict => {
  switch (riskLevel) {
    case 'CRITICAL':
    case 'HIGH':
      return 'Malicious';
    case 'MEDIUM':
      return 'Suspicious';
    case 'LOW':
    case 'NONE':
      return 'Clean';
    case 'UNKNOWN':
    default:
      return 'Unknown';
  }
};

const extractGeoLocation = (
  feeds: readonly FeedResult[]
): GeoLocation | undefined => {
  const usefulFeeds = feeds.filter(isUsefulFeed);

  for (const feed of usefulFeeds) {
    if (feed.geo) {
      const { country, city, org, asn } = feed.geo;
      if (country || city || org || asn) {
        return { country, city, org, asn };
      }
    }
  }

  return undefined;
};

const FEED_WEIGHTS = {
  VirusTotal: 0.8,
  AbuseIPDB: 0.6,
  Shodan: 0.5,
  IPInfo: 0.4,
  AbstractEmail: 0.6,
  default: 0.5,
} as const;

const getFeedWeight = (feedName: string): number => {
  if (feedName in FEED_WEIGHTS) {
    return FEED_WEIGHTS[feedName as keyof typeof FEED_WEIGHTS];
  }

  return FEED_WEIGHTS.default;
};

export function correlate(feeds: readonly FeedResult[]): CorrelationResult {
  const usefulFeeds = feeds.filter(isUsefulFeed);
  if (usefulFeeds.length === 0) {
    return {
      riskScore: 0,
      riskLevel: 'UNKNOWN',
      verdict: 'Unknown',
      tags: [],
    };
  }

  const scores = usefulFeeds.map(scoreFromFeed);
  const weightedScores = usefulFeeds.map(
    (feed, i) => (scores[i] ?? 0) * getFeedWeight(feed.feedName)
  );

  let riskScore = Math.max(...weightedScores);

  const consensusCount = scores.filter(s => s > 50).length;
  if (consensusCount >= 2) {
    riskScore += 10;
  }

  riskScore = clamp(riskScore, 0, 100);

  const riskLevel = riskLevelFromScore(riskScore);
  const verdict = verdictFromRiskLevel(riskLevel);
  const geoLocation = extractGeoLocation(feeds);

  const tagSet = new Set<string>();
  for (const feed of feeds) {
    if (isUsefulFeed(feed)) {
      for (const tag of feed.tags ?? []) {
        tagSet.add(tag);
      }
    }
  }

  return {
    riskScore,
    riskLevel,
    verdict,
    geoLocation,
    tags: Array.from(tagSet.values()).sort()
  };
}