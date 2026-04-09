import { useState, useEffect } from 'react';
import type { ThreatProfile, FeedResult, MitreTechnique, RiskLevel } from '../types';

// ─── Color / style helpers ────────────────────────────────────────────────────

function riskTextColor(level: RiskLevel): string {
  const m: Record<RiskLevel, string> = {
    CRITICAL: 'text-red-500',
    HIGH:     'text-orange-500',
    MEDIUM:   'text-yellow-500',
    LOW:      'text-green-500',
    NONE:     'text-slate-400',
    UNKNOWN:  'text-slate-500',
  };
  return m[level] ?? 'text-slate-500';
}

function riskDot(level: RiskLevel): string {
  const m: Record<RiskLevel, string> = {
    CRITICAL: 'bg-red-500',
    HIGH:     'bg-orange-500',
    MEDIUM:   'bg-yellow-500',
    LOW:      'bg-green-500',
    NONE:     'bg-slate-500',
    UNKNOWN:  'bg-slate-600',
  };
  return m[level] ?? 'bg-slate-600';
}

function arcStroke(score: number): string {
  if (score >= 80) return '#ef4444';
  if (score >= 60) return '#f97316';
  if (score >= 40) return '#eab308';
  if (score >= 20) return '#22c55e';
  return '#64748b';
}

function verdictStyles(verdict: string): { bg: string; text: string; label: string } {
  const m: Record<string, { bg: string; text: string; label: string }> = {
    Malicious:  { bg: 'bg-red-500/10',     text: 'text-red-400',     label: 'Multiple threat feeds confirm this indicator is dangerous' },
    Suspicious: { bg: 'bg-yellow-500/10',  text: 'text-yellow-400',  label: 'Some indicators of compromise detected — investigate further' },
    Clean:      { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'No significant threats detected across queried feeds' },
    Unknown:    { bg: 'bg-slate-500/10',   text: 'text-slate-400',   label: 'Insufficient data to determine threat level' },
  };
  return m[verdict] ?? m.Unknown;
}

function statusDot(status: string): string {
  const m: Record<string, string> = {
    success:      'bg-emerald-400',
    failed:       'bg-red-400',
    timeout:      'bg-yellow-400',
    circuit_open: 'bg-orange-400',
    disabled:     'bg-slate-500',
    unsupported:  'bg-slate-500',
    cached:       'bg-blue-400',
  };
  return m[status] ?? 'bg-slate-500';
}

function statusBadgeClasses(status: string): string {
  const m: Record<string, string> = {
    success:      'bg-emerald-500/20 text-emerald-400',
    failed:       'bg-red-500/20 text-red-400',
    timeout:      'bg-yellow-500/20 text-yellow-400',
    circuit_open: 'bg-orange-500/20 text-orange-400',
    disabled:     'bg-slate-500/20 text-slate-400',
    unsupported:  'bg-slate-500/20 text-slate-400',
    cached:       'bg-blue-500/20 text-blue-400',
  };
  return m[status] ?? 'bg-slate-500/20 text-slate-400';
}

function latencyColor(ms: number): string {
  if (ms > 7000) return 'text-red-400';
  if (ms > 5000) return 'text-yellow-400';
  return 'text-slate-500';
}

function tacticBadge(tactic: string): string {
  const m: Record<string, string> = {
    'Command and Control':   'bg-orange-500/20 text-orange-400',
    'Initial Access':        'bg-blue-500/20 text-blue-400',
    'Execution':             'bg-red-500/20 text-red-400',
    'Persistence':           'bg-purple-500/20 text-purple-400',
    'Privilege Escalation':  'bg-pink-500/20 text-pink-400',
    'Defense Evasion':       'bg-yellow-500/20 text-yellow-400',
    'Credential Access':     'bg-amber-500/20 text-amber-400',
    'Discovery':             'bg-cyan-500/20 text-cyan-400',
    'Lateral Movement':      'bg-indigo-500/20 text-indigo-400',
    'Collection':            'bg-lime-500/20 text-lime-400',
    'Exfiltration':          'bg-rose-500/20 text-rose-400',
    'Impact':                'bg-red-600/20 text-red-500',
    'Resource Development':  'bg-teal-500/20 text-teal-400',
    'Reconnaissance':        'bg-sky-500/20 text-sky-400',
  };
  return m[tactic] ?? 'bg-slate-500/20 text-slate-400';
}

// ─── Visual bar ───────────────────────────────────────────────────────────────

function ProgressBar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${Math.min(ratio * 100, 100)}%` }}
      />
    </div>
  );
}

// ─── RiskScoreGauge ───────────────────────────────────────────────────────────

function RiskScoreGauge({ score, riskLevel }: { score: number; riskLevel: RiskLevel }) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedScore(score), 50);
    return () => clearTimeout(timer);
  }, [score]);

  const r = 46;
  const cx = 60;
  const cy = 60;
  const circumference = 2 * Math.PI * r;
  // We show ~75% of the circle (270 degrees), starting from bottom-left
  const arcLen = circumference * 0.75;
  const offset = arcLen - (animatedScore / 100) * arcLen;
  const stroke = arcStroke(score);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 120 120" className="w-32 h-32 -rotate-[135deg]">
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Track */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="#1e293b"
            strokeWidth="10"
            strokeDasharray={`${arcLen} ${circumference - arcLen}`}
            strokeLinecap="round"
          />
          {/* Progress */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="10"
            strokeDasharray={`${arcLen} ${circumference - arcLen}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            filter="url(#glow)"
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold font-mono" style={{ color: stroke }}>
            {score}
          </span>
          <span className="text-xs text-slate-500">/ 100</span>
        </div>
      </div>
      <span className={`text-sm font-bold mt-1 tracking-wide ${riskTextColor(riskLevel)}`}>
        {riskLevel}
      </span>
    </div>
  );
}

// ─── FeedCard ─────────────────────────────────────────────────────────────────

function VirusTotalBody({ feed }: { feed: FeedResult }) {
  const d = feed.data ?? {};
  const detections  = feed.detections  ?? 0;
  const total       = feed.totalEngines ?? 0;
  const confidence  = feed.confidenceScore ?? 0;
  const ratio       = total > 0 ? detections / total : 0;
  const barColor    = ratio > 0.5 ? 'bg-red-500' : ratio > 0.2 ? 'bg-orange-500' : ratio > 0 ? 'bg-yellow-500' : 'bg-emerald-500';
  const votes = d.communityVotes as { harmless?: number; malicious?: number } | undefined;
  const tags = feed.tags ?? [];

  return (
    <div className="space-y-2 text-xs">
      <div>
        <div className="flex justify-between text-slate-400 mb-1">
          <span>Engine detections</span>
          <span className={`font-mono font-bold ${detections > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {detections} / {total}
          </span>
        </div>
        <ProgressBar ratio={ratio} color={barColor} />
      </div>
      <div className="flex justify-between text-slate-400">
        <span>Confidence</span>
        <span className={`font-mono font-bold ${confidence > 60 ? 'text-red-400' : confidence > 30 ? 'text-yellow-400' : 'text-emerald-400'}`}>
          {confidence}%
        </span>
      </div>
      {votes && (
        <div className="flex justify-between text-slate-400">
          <span>Community</span>
          <span className="font-mono">
            <span className="text-emerald-400">{votes.harmless ?? 0}✓</span>
            {' '}
            <span className="text-red-400">{votes.malicious ?? 0}✗</span>
          </span>
        </div>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {tags.map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded text-xs">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AbuseIPDBBody({ feed }: { feed: FeedResult }) {
  const d = feed.data ?? {};
  const confidence   = feed.confidenceScore ?? 0;
  const totalReports = d.totalReports as number | undefined;
  const isp          = d.isp           as string | undefined;
  const barColor     = confidence > 80 ? 'bg-red-500' : confidence > 50 ? 'bg-orange-500' : confidence > 20 ? 'bg-yellow-500' : 'bg-emerald-500';
  const tags = feed.tags ?? [];

  return (
    <div className="space-y-2 text-xs">
      <div>
        <div className="flex justify-between text-slate-400 mb-1">
          <span>Abuse confidence</span>
          <span className={`font-mono font-bold ${confidence > 60 ? 'text-red-400' : confidence > 30 ? 'text-yellow-400' : 'text-emerald-400'}`}>
            {confidence}%
          </span>
        </div>
        <ProgressBar ratio={confidence / 100} color={barColor} />
      </div>
      {totalReports !== undefined && (
        <div className="flex justify-between text-slate-400">
          <span>Total reports</span>
          <span className={`font-mono font-bold ${totalReports > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {totalReports}
          </span>
        </div>
      )}
      {isp && (
        <div className="flex justify-between text-slate-400">
          <span>ISP</span>
          <span className="font-mono text-slate-300 text-right max-w-[120px] truncate">{isp}</span>
        </div>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {tags.map(tag => (
            <span key={tag} className="px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded">{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ShodanBody({ feed }: { feed: FeedResult }) {
  const d    = feed.data ?? {};
  const ports = (d.ports as number[] | undefined) ?? [];
  const vulns = (d.vulns as string[] | undefined) ?? [];
  const os    = d.os    as string | undefined;

  return (
    <div className="space-y-2 text-xs">
      {ports.length > 0 && (
        <div>
          <span className="text-slate-400 block mb-1">Open ports</span>
          <div className="flex flex-wrap gap-1">
            {ports.slice(0, 8).map(p => (
              <span key={p} className="px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded font-mono">{p}</span>
            ))}
            {ports.length > 8 && (
              <span className="px-1.5 py-0.5 text-slate-500 rounded">+{ports.length - 8}</span>
            )}
          </div>
        </div>
      )}
      {vulns.length > 0 && (
        <div>
          <span className="text-slate-400 block mb-1">CVEs ({vulns.length})</span>
          <div className="flex flex-wrap gap-1">
            {vulns.slice(0, 3).map(v => (
              <span key={v} className="px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded font-mono">{v}</span>
            ))}
            {vulns.length > 3 && (
              <span className="px-1.5 py-0.5 text-red-500 rounded">+{vulns.length - 3}</span>
            )}
          </div>
        </div>
      )}
      {os && (
        <div className="flex justify-between text-slate-400">
          <span>OS</span>
          <span className="text-slate-300">{os}</span>
        </div>
      )}
      {ports.length === 0 && vulns.length === 0 && !os && (
        <p className="text-slate-500 text-xs">No open ports or vulnerabilities detected</p>
      )}
    </div>
  );
}

function IPInfoBody({ feed }: { feed: FeedResult }) {
  const d    = feed.data  ?? {};
  const tags = feed.tags  ?? [];
  const asn  = d.asn      as string | undefined;
  const asnName = d.asnName as string | undefined;
  const type = d.type     as string | undefined;

  const privacyChips: { label: string; className: string }[] = [];
  if (tags.includes('anonymous-network'))
    privacyChips.push({ label: 'Anonymous Network', className: 'bg-red-500/20 text-red-400' });
  if (tags.includes('tor'))
    privacyChips.push({ label: 'Tor', className: 'bg-red-500/20 text-red-400' });
  if (tags.includes('vpn'))
    privacyChips.push({ label: 'VPN', className: 'bg-purple-500/20 text-purple-400' });
  if (tags.includes('proxy'))
    privacyChips.push({ label: 'Proxy', className: 'bg-orange-500/20 text-orange-400' });
  if (tags.includes('hosting'))
    privacyChips.push({ label: 'Hosting', className: 'bg-blue-500/20 text-blue-400' });

  return (
    <div className="space-y-2 text-xs">
      {privacyChips.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {privacyChips.map(c => (
            <span key={c.label} className={`px-2 py-0.5 rounded font-medium ${c.className}`}>{c.label}</span>
          ))}
        </div>
      ) : (
        <p className="text-emerald-400">✓ No privacy flags detected</p>
      )}
      {(asn || asnName) && (
        <div className="text-slate-400 font-mono truncate">
          {asn ?? ''}{asn && asnName ? ' — ' : ''}{asnName ?? ''}
        </div>
      )}
      {type && (
        <div className="flex justify-between text-slate-400">
          <span>Type</span>
          <span className="text-slate-300">{type}</span>
        </div>
      )}
    </div>
  );
}

function EmailBody({ feed }: { feed: FeedResult }) {
  const d = feed.data ?? {};
  const quality    = d.qualityScore   as number | undefined;
  const isDispose  = d.isDisposable   as boolean | undefined;
  const isFree     = d.isFreeEmail    as boolean | undefined;
  const isMx       = d.isMxFound      as boolean | undefined;
  const isSmtp     = d.isSmtpValid    as boolean | undefined;
  const isValid    = d.isValidFormat  as boolean | undefined;

  const riskChips: { label: string; className: string }[] = [];
  if (isDispose) riskChips.push({ label: 'Disposable',   className: 'bg-red-500/20 text-red-400' });
  if (isFree)    riskChips.push({ label: 'Free Email',   className: 'bg-yellow-500/20 text-yellow-400' });
  if (isMx === false)  riskChips.push({ label: 'No MX Record', className: 'bg-red-500/20 text-red-400' });
  if (isSmtp === false) riskChips.push({ label: 'SMTP Invalid', className: 'bg-red-500/20 text-red-400' });

  const barColor = quality !== undefined
    ? quality > 0.7 ? 'bg-emerald-500' : quality > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
    : 'bg-slate-600';

  return (
    <div className="space-y-2 text-xs">
      {isValid !== undefined && (
        <div className="flex justify-between text-slate-400">
          <span>Valid format</span>
          <span className={isValid ? 'text-emerald-400' : 'text-red-400'}>
            {isValid ? '✓ Yes' : '✗ No'}
          </span>
        </div>
      )}
      {quality !== undefined && (
        <div>
          <div className="flex justify-between text-slate-400 mb-1">
            <span>Quality score</span>
            <span className={`font-mono font-bold ${quality > 0.7 ? 'text-emerald-400' : quality > 0.4 ? 'text-yellow-400' : 'text-red-400'}`}>
              {quality.toFixed(2)}
            </span>
          </div>
          <ProgressBar ratio={quality} color={barColor} />
        </div>
      )}
      {riskChips.length > 0 ? (
        <div className="flex flex-wrap gap-1 pt-1">
          {riskChips.map(c => (
            <span key={c.label} className={`px-2 py-0.5 rounded font-medium ${c.className}`}>{c.label}</span>
          ))}
        </div>
      ) : (
        quality !== undefined && <p className="text-emerald-400">✓ No risk flags detected</p>
      )}
    </div>
  );
}

function FeedCard({ feed }: { feed: FeedResult }) {
  const statusLabel = feed.status.replace(/_/g, ' ');

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden hover:border-slate-600 transition-colors flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between gap-2">
        <span className="font-semibold text-sm text-slate-200">{feed.feedName}</span>
        <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium ${statusBadgeClasses(feed.status)}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot(feed.status)}`} />
          {statusLabel}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 flex-1">
        {feed.status === 'success' && (
          feed.feedName === 'VirusTotal'   ? <VirusTotalBody feed={feed} /> :
          feed.feedName === 'AbuseIPDB'    ? <AbuseIPDBBody feed={feed} /> :
          feed.feedName === 'Shodan'       ? <ShodanBody feed={feed} /> :
          feed.feedName === 'IPInfo'       ? <IPInfoBody feed={feed} /> :
          feed.feedName === 'AbstractEmail'? <EmailBody feed={feed} /> :
          <p className="text-slate-400 text-xs">Feed responded successfully.</p>
        )}

        {(feed.status === 'failed' || feed.status === 'timeout') && (
          <p className="text-red-400 text-xs">
            {feed.status === 'timeout'
              ? '⏱ Feed timed out — took too long to respond'
              : feed.error ?? 'Feed returned an error'}
          </p>
        )}

        {feed.status === 'circuit_open' && (
          <p className="text-orange-400 text-xs">
            ⚠ Feed temporarily disabled due to repeated failures
          </p>
        )}

        {(feed.status === 'disabled' || feed.status === 'unsupported') && (
          <p className="text-slate-500 text-xs capitalize">
            {feed.status === 'unsupported'
              ? 'This feed does not support this IoC type'
              : 'Feed is disabled'}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className={`px-4 py-2 border-t border-slate-700/50 bg-slate-800/50 text-xs ${latencyColor(feed.latencyMs)}`}>
        {feed.latencyMs}ms
        {feed.latencyMs > 7000 && ' · Very slow'}
        {feed.latencyMs > 5000 && feed.latencyMs <= 7000 && ' · Slow'}
      </div>
    </div>
  );
}

// ─── MitreTechniqueCard ───────────────────────────────────────────────────────

function MitreTechniqueCard({ technique }: { technique: MitreTechnique }) {
  const techId = technique.id.replace('/', '');
  const url = `https://attack.mitre.org/techniques/${techId}/`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-slate-800 rounded-lg border border-slate-700 p-4 hover:border-blue-500/50 transition-colors cursor-pointer group flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono font-bold text-blue-400 text-base group-hover:text-blue-300 transition-colors">
          {technique.id}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${tacticBadge(technique.tactic)}`}>
          {technique.tactic}
        </span>
      </div>
      <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
        {technique.name}
      </p>
      {technique.description && (
        <p className="text-xs text-slate-400 line-clamp-2">{technique.description}</p>
      )}
      <div className="flex justify-end mt-auto">
        <span className="text-xs text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
          View →
        </span>
      </div>
    </a>
  );
}

// ─── ThreatProfilePanel (main export) ────────────────────────────────────────

interface Props { profile: ThreatProfile }

export function ThreatProfilePanel({ profile }: Props) {
  const v = verdictStyles(profile.verdict);
  const geo = profile.geoLocation;

  return (
    <div className="space-y-4">
      {/* ── HEADER ── */}
      <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-3 h-3 rounded-full shrink-0 ${riskDot(profile.riskLevel)}`} />
              <span className="font-mono text-xl font-bold text-white break-all">
                {profile.ioc}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-blue-600/20 text-blue-400 text-xs px-2 py-0.5 rounded font-mono uppercase">
                {profile.type}
              </span>
              {profile.hashType && (
                <span className="bg-purple-600/20 text-purple-400 text-xs px-2 py-0.5 rounded font-mono uppercase">
                  {profile.hashType}
                </span>
              )}
              {profile.cachedAt && (
                <span className="bg-cyan-600/20 text-cyan-400 text-xs px-2 py-0.5 rounded">
                  ⚡ Cached
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-slate-400 text-sm">
              Analyzed in {(profile.queryDurationMs / 1000).toFixed(1)}s
            </p>
            {profile.systemStatus && profile.systemStatus.overall !== 'healthy' && (
              <p className="text-yellow-400 text-xs mt-1">
                ⚠ {profile.systemStatus.overall} mode
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── RISK OVERVIEW (3-col grid) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Score card */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col items-center justify-center gap-2">
          <RiskScoreGauge score={profile.riskScore} riskLevel={profile.riskLevel} />
        </div>

        {/* Verdict card */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col items-center justify-center gap-3">
          <div className={`w-full rounded-lg p-4 text-center ${v.bg}`}>
            <p className={`text-2xl font-bold ${v.text}`}>{profile.verdict}</p>
          </div>
          <p className="text-xs text-slate-400 text-center">{v.label}</p>
        </div>

        {/* Location card */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col justify-center gap-1.5">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Location</p>
          {geo && (geo.country || geo.org || geo.asn) ? (
            <>
              {geo.country && (
                <p className="text-lg font-semibold text-slate-200">{geo.country}</p>
              )}
              {geo.city && (
                <p className="text-sm text-slate-400">{geo.city}</p>
              )}
              {geo.asn && (
                <p className="text-sm text-slate-400 font-mono">{geo.asn}</p>
              )}
              {geo.org && (
                <p className="text-sm text-slate-400">{geo.org}</p>
              )}
            </>
          ) : (
            <p className="text-slate-500 text-sm text-center">Location data unavailable</p>
          )}
        </div>
      </div>

      {/* ── FEED RESULTS ── */}
      <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
        <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <span>📡</span>
          Feed Results
          <span className="ml-auto text-xs text-slate-500 font-normal">
            {profile.feeds.filter(f => f.status === 'success').length}/{profile.feeds.length} succeeded
          </span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {profile.feeds.map((feed, i) => (
            <FeedCard key={`${feed.feedName}-${i}`} feed={feed} />
          ))}
        </div>
      </div>

      {/* ── MITRE ATT&CK ── */}
      {profile.mitreTechniques.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <span>🛡️</span>
            MITRE ATT&amp;CK Mapping
            <span className="ml-auto text-xs text-slate-500 font-normal">
              {profile.mitreTechniques.length} technique{profile.mitreTechniques.length !== 1 ? 's' : ''}
            </span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {profile.mitreTechniques.map(t => (
              <MitreTechniqueCard key={t.id} technique={t} />
            ))}
          </div>
        </div>
      )}

      {/* ── TYPO SUGGESTION ── */}
      {profile.typoSuggestion && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-5 py-3 text-sm text-yellow-400">
          💡 Did you mean <span className="font-mono font-semibold">{profile.typoSuggestion}</span>?
        </div>
      )}
    </div>
  );
}

export default ThreatProfilePanel;
