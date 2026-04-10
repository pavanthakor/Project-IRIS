import type { FeedResult } from '../../types';

interface FeedResultRowProps {
  feed: FeedResult;
}

type RowVerdict = 'Malicious' | 'Abusive' | 'Suspicious' | 'Clean' | 'Info' | 'Unavailable' | 'Found' | 'Listed' | 'VPN';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function unavailableStatus(status: FeedResult['status']): boolean {
  return status === 'failed' || status === 'timeout' || status === 'circuit_open' || status === 'disabled' || status === 'unsupported';
}

function extractPortCount(feed: FeedResult): number | null {
  const payload = asRecord(feed.data) ?? asRecord(feed.rawData);
  if (!payload) return null;

  const ports = payload.ports;
  if (Array.isArray(ports)) return ports.length;
  if (typeof ports === 'number') return ports;

  const openPorts = payload.openPorts;
  if (Array.isArray(openPorts)) return openPorts.length;
  if (typeof openPorts === 'number') return openPorts;

  return null;
}

function containsTag(feed: FeedResult, keyword: string): boolean {
  const tags = feed.tags ?? [];
  return tags.some((tag) => tag.toLowerCase().includes(keyword));
}

function detectMetric(feed: FeedResult): string {
  if (unavailableStatus(feed.status)) {
    if (feed.status === 'circuit_open') return 'circuit open';
    if (feed.status === 'timeout') return 'timeout';
    return 'unavailable';
  }

  if (typeof feed.detections === 'number' && typeof feed.totalEngines === 'number') {
    return `${feed.detections}/${feed.totalEngines}`;
  }

  if (typeof feed.confidenceScore === 'number') {
    return `score ${Math.round(feed.confidenceScore)}`;
  }

  const portCount = extractPortCount(feed);
  if (typeof portCount === 'number' && portCount >= 0) {
    return `${portCount} ports`;
  }

  if (containsTag(feed, 'hosting')) return 'hosting';
  if (containsTag(feed, 'vpn')) return 'vpn';
  if (containsTag(feed, 'disposable')) return 'disposable';

  const firstTag = feed.tags?.[0];
  if (firstTag) return firstTag;

  return 'no signal';
}

function detectVerdict(feed: FeedResult): RowVerdict {
  if (unavailableStatus(feed.status)) return 'Unavailable';

  const feedName = feed.feedName.toLowerCase();
  const detections = feed.detections ?? 0;
  const confidence = typeof feed.confidenceScore === 'number' ? feed.confidenceScore : 0;

  if (feedName.includes('virustotal')) {
    return detections > 0 ? 'Malicious' : 'Clean';
  }

  if (feedName.includes('abuse')) {
    if (confidence >= 70) return 'Abusive';
    if (confidence >= 30) return 'Suspicious';
    return 'Clean';
  }

  if (feedName.includes('phishtank')) {
    return detections > 0 ? 'Found' : 'Clean';
  }

  if (containsTag(feed, 'vpn')) return 'VPN';
  if (containsTag(feed, 'hosting')) return 'Info';
  if (containsTag(feed, 'disposable')) return 'Suspicious';

  const portCount = extractPortCount(feed);
  if (typeof portCount === 'number' && portCount > 0) return 'Info';

  if (detections > 0 || confidence >= 75) return 'Malicious';
  if (confidence >= 40) return 'Suspicious';

  return 'Info';
}

function verdictClasses(verdict: RowVerdict): string {
  switch (verdict) {
    case 'Malicious':
    case 'Abusive':
      return 'bg-iris-danger/20 text-iris-danger';
    case 'Suspicious':
      return 'bg-iris-warning/20 text-iris-warning';
    case 'Clean':
    case 'Info':
    case 'VPN':
      return 'bg-iris-success/20 text-iris-success';
    case 'Unavailable':
      return 'bg-iris-border text-iris-text-muted';
    case 'Found':
    case 'Listed':
      return 'bg-iris-info/20 text-iris-info';
    default:
      return 'bg-iris-border text-iris-text-muted';
  }
}

export default function FeedResultRow({ feed }: FeedResultRowProps) {
  const metric = detectMetric(feed);
  const verdict = detectVerdict(feed);

  return (
    <div className="flex items-center justify-between gap-2 border-b border-iris-border/50 px-4 py-3 last:border-0">
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-iris-text">{feed.feedName}</p>
      <p className="hidden min-w-[110px] text-right text-xs text-iris-text-dim sm:block">{metric}</p>
      <span className={`iris-badge ${verdictClasses(verdict)}`}>{verdict}</span>
    </div>
  );
}
