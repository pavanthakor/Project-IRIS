import type { FeedResult } from '../../types';
import FeedResultRow from './FeedResultRow';

interface FeedResultsPanelProps {
  feeds: readonly FeedResult[];
}

const FEED_ORDER = [
  'VirusTotal',
  'AbuseIPDB',
  'Shodan',
  'IPInfo',
  'AbstractEmail',
  'PhishTank',
] as const;

function byFeedOrder(a: FeedResult, b: FeedResult): number {
  const aIndex = FEED_ORDER.findIndex((name) => name.toLowerCase() === a.feedName.toLowerCase());
  const bIndex = FEED_ORDER.findIndex((name) => name.toLowerCase() === b.feedName.toLowerCase());

  if (aIndex === -1 && bIndex === -1) return a.feedName.localeCompare(b.feedName);
  if (aIndex === -1) return 1;
  if (bIndex === -1) return -1;
  return aIndex - bIndex;
}

export default function FeedResultsPanel({ feeds }: FeedResultsPanelProps) {
  const orderedFeeds = [...feeds].sort(byFeedOrder);

  return (
    <section className="iris-card overflow-hidden">
      <header className="border-b border-iris-border px-4 py-3 text-sm font-semibold text-iris-text">
        Feed results
      </header>

      {orderedFeeds.length === 0 ? (
        <div className="px-4 py-8 text-sm text-iris-text-muted">No feed data available for this indicator.</div>
      ) : (
        <div>
          {orderedFeeds.map((feed) => (
            <FeedResultRow key={feed.feedName} feed={feed} />
          ))}
        </div>
      )}
    </section>
  );
}
