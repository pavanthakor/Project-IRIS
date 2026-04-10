const feedNames = [
  'AbuseIPDB',
  'VirusTotal',
  'Shodan',
  'IPInfo',
  'AlienVault OTX',
  'PhishTank',
  'ThreatFox',
  'URLhaus',
  'MalwareBazaar',
  'FeodoTracker',
  'Spamhaus',
];

export default function TrustedSources() {
  return (
    <section id="feeds" className="py-12 bg-iris-base-light">
      <div className="container mx-auto px-4 text-center">
        <h3 className="mb-6 text-sm font-semibold tracking-wider uppercase text-iris-text-dim">
          Aggregating intelligence from industry-leading feeds
        </h3>
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {feedNames.map((name) => (
            <span key={name} className="text-lg font-medium text-iris-text-dim/70">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
