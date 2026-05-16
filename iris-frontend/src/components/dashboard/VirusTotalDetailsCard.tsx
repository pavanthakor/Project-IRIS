import type { FeedResult, ThreatProfile } from '../../types';

interface VirusTotalDetailsCardProps {
  profile: ThreatProfile;
}

type TopEngineVerdict = { engine: string; category: string; result: string | null };

type DnsRecord = {
  type?: string;
  value?: string;
  ttl?: number;
  priority?: number;
};

type PopularityRank = {
  source: string;
  rank?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function asArrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((v): v is Record<string, unknown> => v !== null);
}

function parseTopVerdicts(value: unknown): TopEngineVerdict[] {
  const rows = asArrayOfRecords(value);
  return rows
    .map((row) => ({
      engine: asString(row.engine) ?? 'Unknown',
      category: asString(row.category) ?? 'unknown',
      result: (row.result === null || typeof row.result === 'string') ? row.result : null,
    }))
    .slice(0, 8);
}

function parseDnsRecords(value: unknown): DnsRecord[] {
  const rows = asArrayOfRecords(value);
  return rows
    .map((row) => ({
      type: asString(row.type) ?? undefined,
      value: asString(row.value) ?? undefined,
      ttl: asNumber(row.ttl) ?? undefined,
      priority: asNumber(row.priority) ?? undefined,
    }))
    .slice(0, 10);
}

function parsePopularityRanks(value: unknown): PopularityRank[] {
  const rows = asArrayOfRecords(value);
  return rows
    .map((row) => ({
      source: asString(row.source) ?? 'unknown',
      rank: asNumber(row.rank) ?? undefined,
    }))
    .slice(0, 8);
}

function findVirusTotalFeed(profile: ThreatProfile): FeedResult | null {
  for (const feed of profile.feeds) {
    if (feed.feedName.toLowerCase().includes('virustotal')) return feed;
  }
  return null;
}

export default function VirusTotalDetailsCard({ profile }: VirusTotalDetailsCardProps) {
  const vtFeed = findVirusTotalFeed(profile);
  if (!vtFeed) return null;

  const payload = asRecord(vtFeed.data) ?? asRecord(vtFeed.rawData);
  const data = asRecord(payload);

  const tags = vtFeed.tags ?? [];

  const reputation = data ? asNumber(data.reputation) : null;
  const lastAnalysisDate = data ? asString(data.lastAnalysisDate) : null;
  const creationDate = data ? asString(data.creationDate) : null;
  const country = data ? asString(data.country) : null;
  const tld = data ? asString(data.tld) : null;

  const categories = data ? asStringArray(data.categories) : [];
  const dnsRecords = data ? parseDnsRecords(data.lastDnsRecords) : [];
  const popularity = data ? parsePopularityRanks(data.popularityRanks) : [];
  const topVerdicts = data ? parseTopVerdicts(data.topEngineVerdicts) : [];

  return (
    <section className="iris-card p-6">
      <header className="mb-4 text-sm font-semibold text-iris-text">VirusTotal details</header>

      {vtFeed.status !== 'success' && vtFeed.status !== 'cached' ? (
        <div className="rounded-lg border border-iris-border bg-iris-elevated px-4 py-3 text-sm text-iris-text-dim">
          <p className="font-medium text-iris-text">Feed unavailable</p>
          <p className="mt-1">{vtFeed.error ?? `Status: ${vtFeed.status}`}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-iris-text-muted">Reputation</div>
          <div className="mt-1 text-sm text-iris-text">{reputation ?? '—'}</div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-iris-text-muted">TLD / Country</div>
          <div className="mt-1 text-sm text-iris-text">{[tld, country].filter(Boolean).join(' · ') || '—'}</div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-iris-text-muted">Last analysis</div>
          <div className="mt-1 text-sm text-iris-text">{lastAnalysisDate ?? '—'}</div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-iris-text-muted">Creation date</div>
          <div className="mt-1 text-sm text-iris-text">{creationDate ?? '—'}</div>
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="mt-5">
          <div className="text-xs uppercase tracking-wider text-iris-text-muted">Tags</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.slice(0, 12).map((tag) => (
              <span key={tag} className="iris-badge bg-iris-info/20 text-iris-info">
                {tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {categories.length > 0 ? (
        <div className="mt-5">
          <div className="text-xs uppercase tracking-wider text-iris-text-muted">Categories</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories.slice(0, 10).map((cat) => (
              <span key={cat} className="iris-badge bg-iris-accent/15 text-iris-accent">
                {cat}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {topVerdicts.length > 0 ? (
        <div className="mt-5">
          <div className="text-xs uppercase tracking-wider text-iris-text-muted">Top engine verdicts</div>
          <ul className="mt-2 space-y-1 text-sm text-iris-text">
            {topVerdicts.map((v) => (
              <li key={`${v.engine}:${v.category}:${v.result ?? ''}`} className="flex items-center justify-between gap-3">
                <span className="truncate font-medium">{v.engine}</span>
                <span className="shrink-0 text-iris-text-dim">{v.category}{v.result ? ` · ${v.result}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {dnsRecords.length > 0 ? (
        <div className="mt-5">
          <div className="text-xs uppercase tracking-wider text-iris-text-muted">Last DNS records</div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-iris-text-muted">
                  <th className="py-1 pr-3">Type</th>
                  <th className="py-1 pr-3">Value</th>
                  <th className="py-1 pr-3">TTL</th>
                  <th className="py-1">Priority</th>
                </tr>
              </thead>
              <tbody>
                {dnsRecords.map((r, idx) => (
                  <tr key={idx} className="border-t border-iris-border/40">
                    <td className="py-1 pr-3 font-mono text-iris-text">{r.type ?? '—'}</td>
                    <td className="py-1 pr-3 font-mono text-iris-text">{r.value ?? '—'}</td>
                    <td className="py-1 pr-3 text-iris-text-dim">{r.ttl ?? '—'}</td>
                    <td className="py-1 text-iris-text-dim">{r.priority ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {popularity.length > 0 ? (
        <div className="mt-5">
          <div className="text-xs uppercase tracking-wider text-iris-text-muted">Popularity ranks</div>
          <ul className="mt-2 space-y-1 text-sm text-iris-text">
            {popularity.map((p) => (
              <li key={p.source} className="flex items-center justify-between gap-3">
                <span className="truncate">{p.source}</span>
                <span className="shrink-0 text-iris-text-dim">{p.rank ?? '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <footer className="mt-5 text-xs text-iris-text-muted">
        Latency: {vtFeed.latencyMs}ms
      </footer>
    </section>
  );
}
