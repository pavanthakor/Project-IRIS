import type { FeedResult, ThreatProfile } from '../../types';

interface GeoLocationCardProps {
  profile: ThreatProfile;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function findStringByKeys(payload: unknown, keys: readonly string[]): string | undefined {
  const root = asRecord(payload);
  if (!root) return undefined;

  for (const key of keys) {
    const direct = root[key];
    if (typeof direct === 'string' && direct.trim().length > 0) {
      return direct;
    }
  }

  for (const value of Object.values(root)) {
    const nested = asRecord(value);
    if (!nested) continue;
    for (const key of keys) {
      const candidate = nested[key];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate;
      }
    }
  }

  return undefined;
}

function pickFromFeeds(feeds: readonly FeedResult[], keys: readonly string[]): string | undefined {
  for (const feed of feeds) {
    const fromData = findStringByKeys(feed.data, keys);
    if (fromData) return fromData;

    const fromRaw = findStringByKeys(feed.rawData, keys);
    if (fromRaw) return fromRaw;
  }
  return undefined;
}

export default function GeoLocationCard({ profile }: GeoLocationCardProps) {
  const country = profile.geoLocation?.country;
  const city = profile.geoLocation?.city;
  const asn = profile.geoLocation?.asn ?? pickFromFeeds(profile.feeds, ['asn', 'asn_name']);
  const org = profile.geoLocation?.org ?? pickFromFeeds(profile.feeds, ['org', 'organization']);
  const isp = pickFromFeeds(profile.feeds, ['isp', 'provider']);
  const ptr = pickFromFeeds(profile.feeds, ['ptr', 'hostname', 'reverse']);

  const hasGeo = Boolean(country || city || asn || org || isp || ptr);

  return (
    <section className="iris-card p-6">
      <header className="mb-4 text-xs font-semibold uppercase tracking-wider text-iris-text-muted">
        Geolocation
      </header>

      {!hasGeo ? (
        <div className="flex h-[200px] items-center justify-center text-sm text-iris-text-muted">
          Location data unavailable
        </div>
      ) : (
        <>
          <p className="text-xl font-semibold text-white">
            {[country, city].filter(Boolean).join(' · ') || 'Unknown location'}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-iris-text-muted">ASN</p>
              <p className="mt-1 font-mono text-sm text-white">{asn || 'none'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-iris-text-muted">Org</p>
              <p className="mt-1 truncate font-mono text-sm text-white">{org || 'none'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-iris-text-muted">ISP</p>
              <p className="mt-1 truncate font-mono text-sm text-white">{isp || 'none'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-iris-text-muted">PTR</p>
              <p className="mt-1 truncate font-mono text-sm text-white">{ptr || 'none'}</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
