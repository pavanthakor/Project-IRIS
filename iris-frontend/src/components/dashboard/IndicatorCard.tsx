import type { ThreatProfile } from '../../types';

interface IndicatorCardProps {
  profile: ThreatProfile;
}

function formatTypeLabel(profile: ThreatProfile): string {
  switch (profile.type) {
    case 'ip':
      return profile.ioc.includes(':') ? 'IPv6' : 'IPv4';
    case 'domain':
      return 'Domain';
    case 'hash':
      return profile.hashType ? profile.hashType.toUpperCase() : 'Hash';
    case 'email':
      return 'Email';
    default:
      return profile.type;
  }
}

function collectPrivacyFlags(profile: ThreatProfile): string[] {
  const flaggedKeywords = ['tor', 'vpn', 'hosting', 'proxy', 'disposable'];
  const tags = new Set<string>();

  for (const feed of profile.feeds) {
    for (const tag of feed.tags ?? []) {
      const normalized = tag.toLowerCase();
      if (flaggedKeywords.some((keyword) => normalized.includes(keyword))) {
        tags.add(tag);
      }
    }
  }

  return Array.from(tags).slice(0, 2);
}

export default function IndicatorCard({ profile }: IndicatorCardProps) {
  const queriedFeeds = profile.feeds.length;
  const durationSeconds = (profile.queryDurationMs / 1000).toFixed(1);
  const typeLabel = formatTypeLabel(profile);
  const asn = profile.geoLocation?.asn;
  const privacyFlags = collectPrivacyFlags(profile);

  return (
    <section className="iris-card p-6">
      <header className="mb-4 text-xs font-semibold uppercase tracking-wider text-iris-text-muted">
        Indicator
      </header>

      <p className="break-all font-mono text-xl font-bold text-white">{profile.ioc}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="iris-badge bg-iris-info/20 text-iris-info">{typeLabel}</span>
        {asn ? <span className="iris-badge bg-iris-accent/15 text-iris-accent">{asn}</span> : null}
        {privacyFlags.map((flag) => (
          <span key={flag} className="iris-badge bg-iris-warning/20 text-iris-warning">
            {flag}
          </span>
        ))}
      </div>

      <footer className="mt-5 text-xs text-iris-text-muted">
        Queried {queriedFeeds} feeds · {durationSeconds}s total
      </footer>
    </section>
  );
}
