import type { FeedResult } from '../../types';

interface ConfidenceBreakdownProps {
  feeds: readonly FeedResult[];
}

const WIDTH_CLASSES = [
  'w-[0%]',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-[100%]',
] as const;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function contributionFromFeed(feed: FeedResult): number {
  if (typeof feed.confidenceScore === 'number') {
    return clamp(Math.round(feed.confidenceScore), 0, 100);
  }

  if (typeof feed.detections === 'number' && typeof feed.totalEngines === 'number' && feed.totalEngines > 0) {
    return clamp(Math.round((feed.detections / feed.totalEngines) * 100), 0, 100);
  }

  if (feed.status === 'failed' || feed.status === 'timeout' || feed.status === 'circuit_open') {
    return 0;
  }

  const tags = feed.tags ?? [];
  if (tags.some((tag) => /malicious|abusive|phishing/i.test(tag))) return 80;
  if (tags.some((tag) => /suspicious|vpn|hosting|proxy|tor|disposable/i.test(tag))) return 55;

  if (feed.status === 'success' || feed.status === 'cached') return 25;
  return 10;
}

function barColorClass(score: number): string {
  if (score >= 80) return 'bg-iris-danger';
  if (score >= 60) return 'bg-iris-warning';
  if (score >= 35) return 'bg-iris-info';
  return 'bg-iris-success';
}

function widthClass(score: number): string {
  const bucket = Math.round(clamp(score, 0, 100) / 5);
  return WIDTH_CLASSES[bucket];
}

export default function ConfidenceBreakdown({ feeds }: ConfidenceBreakdownProps) {
  const rows = feeds
    .map((feed) => ({
      name: feed.feedName,
      score: contributionFromFeed(feed),
    }))
    .sort((a, b) => b.score - a.score);

  return (
    <section className="iris-card p-6">
      <header className="mb-4 text-base font-semibold text-iris-text">Confidence breakdown</header>

      {rows.length === 0 ? (
        <p className="text-sm text-iris-text-muted">No confidence data available.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.name} className="grid grid-cols-[120px_1fr_34px] items-center gap-3">
              <span className="truncate text-sm text-iris-text">{row.name}</span>
              <div className="h-2 overflow-hidden rounded-full bg-iris-border">
                <div className={`h-full rounded-full transition-all duration-300 ${barColorClass(row.score)} ${widthClass(row.score)}`} />
              </div>
              <span className="text-right font-mono text-sm text-iris-text-dim">{row.score}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
