import { useState, useEffect } from 'react';

const MESSAGES = [
  'Querying threat intelligence feeds...',
  'Correlating results across sources...',
  'Mapping MITRE ATT&CK techniques...',
  'Computing risk score...',
  'Enriching with geo-location data...',
  'Finalizing threat profile...',
];

const FEEDS = ['VirusTotal', 'AbuseIPDB', 'Shodan', 'IPInfo'];

export function LoadingState() {
  const [msgIdx, setMsgIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [doneFeedCount, setDoneFeedCount] = useState(0);

  useEffect(() => {
    const msgInterval = setInterval(() => {
      setMsgIdx(i => (i + 1) % MESSAGES.length);
    }, 2200);

    // Simulate feed completion
    const feedTimers = [1200, 2100, 3400, 4600].map((delay, idx) =>
      setTimeout(() => setDoneFeedCount(idx + 1), delay)
    );

    // Progress bar fills over 8s
    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(p + 1.2, 95));
    }, 100);

    return () => {
      clearInterval(msgInterval);
      clearInterval(progressInterval);
      feedTimers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin shrink-0" />
        <span className="text-slate-300 text-sm font-medium transition-all duration-500">
          {MESSAGES[msgIdx]}
        </span>
      </div>

      {/* Feed status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {FEEDS.map((feed, idx) => {
          const done = idx < doneFeedCount;
          return (
            <div
              key={feed}
              className={`rounded-lg border px-4 py-3 text-center text-sm transition-all duration-500 ${
                done
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-slate-700/50 border-slate-600 text-slate-400'
              }`}
            >
              <div className="font-medium text-xs mb-1">{feed}</div>
              {done ? (
                <span className="text-emerald-400">✓ Done</span>
              ) : (
                <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-slate-500">
          <span>{Math.round(progress)}%</span>
          <span>~8s estimated</span>
        </div>
        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Skeleton content */}
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-3 gap-4">
          <div className="h-28 bg-slate-700/50 rounded-xl" />
          <div className="h-28 bg-slate-700/50 rounded-xl" />
          <div className="h-28 bg-slate-700/50 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 bg-slate-700/50 rounded-lg" />
          <div className="h-24 bg-slate-700/50 rounded-lg" />
          <div className="h-24 bg-slate-700/50 rounded-lg" />
          <div className="h-24 bg-slate-700/50 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default LoadingState;
