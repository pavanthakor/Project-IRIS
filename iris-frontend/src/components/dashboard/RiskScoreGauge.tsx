import { useId } from 'react';
import type { ThreatProfile } from '../../types';

interface RiskScoreGaugeProps {
  profile: ThreatProfile;
}

function riskLevelBadgeClasses(level: ThreatProfile['riskLevel']): string {
  switch (level) {
    case 'CRITICAL':
    case 'HIGH':
      return 'bg-iris-danger/20 text-iris-danger border border-iris-danger/30';
    case 'MEDIUM':
      return 'bg-iris-warning/20 text-iris-warning border border-iris-warning/30';
    case 'LOW':
      return 'bg-iris-success/20 text-iris-success border border-iris-success/30';
    case 'NONE':
      return 'bg-iris-border text-iris-text-muted border border-iris-border-light';
    case 'UNKNOWN':
    default:
      return 'bg-iris-info/20 text-iris-info border border-iris-info/30';
  }
}

function riskLevelTextClasses(level: ThreatProfile['riskLevel']): string {
  switch (level) {
    case 'CRITICAL':
    case 'HIGH':
      return 'text-iris-danger';
    case 'MEDIUM':
      return 'text-iris-warning';
    case 'LOW':
      return 'text-iris-success';
    case 'NONE':
      return 'text-iris-text-dim';
    case 'UNKNOWN':
    default:
      return 'text-iris-info';
  }
}

export default function RiskScoreGauge({ profile }: RiskScoreGaugeProps) {
  const score = Math.max(0, Math.min(100, Math.round(profile.riskScore)));
  const gradientId = useId();

  const radius = 96;
  const centerX = 120;
  const centerY = 120;
  const circumference = Math.PI * radius;
  const dashOffset = circumference * (1 - score / 100);

  const needleAngle = Math.PI - (Math.PI * score) / 100;
  const needleX = centerX + radius * Math.cos(needleAngle);
  const needleY = centerY - radius * Math.sin(needleAngle);

  const queriedFeeds = profile.feeds.length;
  const durationSeconds = (profile.queryDurationMs / 1000).toFixed(1);

  return (
    <section className="iris-card p-6">
      <header className="mb-4 text-xs font-semibold uppercase tracking-wider text-iris-text-muted">
        Risk Score
      </header>

      <div className="mx-auto w-full max-w-[260px]">
        <svg viewBox="0 0 240 140" className="w-full">
          <defs>
            <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>

          <path
            d="M 24 120 A 96 96 0 0 1 216 120"
            fill="none"
            stroke="var(--color-iris-border)"
            strokeWidth="12"
            strokeLinecap="round"
          />

          <path
            d="M 24 120 A 96 96 0 0 1 216 120"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />

          <line
            x1={centerX}
            y1={centerY}
            x2={needleX}
            y2={needleY}
            stroke="var(--color-iris-text)"
            strokeWidth="2"
            opacity="0.85"
          />
          <circle cx={centerX} cy={centerY} r="4" fill="var(--color-iris-text)" />
        </svg>
      </div>

      <div className="mt-2 text-center">
        <p className={`font-mono text-5xl font-bold ${riskLevelTextClasses(profile.riskLevel)}`}>{score}</p>
        <span className={`mt-3 inline-flex iris-badge ${riskLevelBadgeClasses(profile.riskLevel)}`}>
          {profile.riskLevel} RISK
        </span>
      </div>

      <footer className="mt-5 text-xs text-iris-text-muted">
        Queried {queriedFeeds} feeds · {durationSeconds}s total
      </footer>
    </section>
  );
}
