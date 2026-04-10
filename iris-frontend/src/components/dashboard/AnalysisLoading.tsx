import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, LoaderCircle } from 'lucide-react';

const PROGRESS_MESSAGES = [
  'Querying threat feeds...',
  'Correlating results...',
  'Mapping ATT&CK techniques...',
  'Generating risk profile...',
] as const;

const DEFAULT_FEEDS = [
  'VirusTotal',
  'AbuseIPDB',
  'Shodan',
  'IPInfo',
  'AbstractEmail',
  'PhishTank',
] as const;

const PROGRESS_WIDTH_CLASSES = [
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

interface AnalysisLoadingProps {
  complete?: boolean;
  ioc?: string;
  feeds?: readonly string[];
}

export default function AnalysisLoading({ complete = false, ioc, feeds }: AnalysisLoadingProps) {
  const feedNames = useMemo(() => (feeds && feeds.length > 0 ? [...feeds] : [...DEFAULT_FEEDS]), [feeds]);
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [revealedFeeds, setRevealedFeeds] = useState(0);
  const progressBucket = Math.max(0, Math.min(20, Math.round(progress / 5)));

  useEffect(() => {
    if (complete) {
      setProgress(100);
      setRevealedFeeds(feedNames.length);
      return undefined;
    }

    const totalMs = 8_000;
    const tickMs = 120;
    const maxBeforeComplete = 90;
    const step = maxBeforeComplete / (totalMs / tickMs);

    const timer = window.setInterval(() => {
      setProgress((prev) => Math.min(maxBeforeComplete, prev + step));
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [complete, feedNames.length]);

  useEffect(() => {
    if (complete) return undefined;
    const timer = window.setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % PROGRESS_MESSAGES.length);
    }, 1700);
    return () => window.clearInterval(timer);
  }, [complete]);

  useEffect(() => {
    if (complete) {
      setRevealedFeeds(feedNames.length);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setRevealedFeeds((prev) => Math.min(feedNames.length, prev + 1));
    }, 500);
    return () => window.clearInterval(timer);
  }, [complete, feedNames.length]);

  return (
    <div className="space-y-4">
      <div className="iris-card p-5">
        <div className="mb-2 flex items-center justify-between text-xs text-iris-text-muted">
          <span>{ioc ? `Analyzing: ${ioc}` : 'Analyzing indicator'}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-iris-border">
          <div
            className={`h-full rounded-full bg-gradient-to-r from-iris-success via-iris-warning to-iris-danger transition-all duration-300 ${PROGRESS_WIDTH_CLASSES[progressBucket]}`}
          />
        </div>
        <p className="mt-3 text-sm text-iris-text-dim">{PROGRESS_MESSAGES[messageIndex]}</p>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {feedNames.map((name, index) => {
            const completeRow = revealedFeeds > index;
            return (
              <div key={name} className="iris-card-elevated flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-iris-text-dim">{name}</span>
                {completeRow ? (
                  <CheckCircle2 size={16} className="text-iris-success" />
                ) : (
                  <LoaderCircle size={16} className="animate-spin text-iris-text-muted" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="iris-card h-[250px] animate-pulse p-6" />
        <div className="iris-card h-[250px] animate-pulse p-6" />
        <div className="iris-card h-[250px] animate-pulse p-6" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="iris-card lg:col-span-2">
          <div className="h-12 border-b border-iris-border/70" />
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-10 animate-pulse rounded bg-iris-elevated/50" />
            ))}
          </div>
        </div>

        <div className="iris-card p-4">
          <div className="mb-3 h-5 w-2/3 animate-pulse rounded bg-iris-elevated/60" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div key={idx} className="h-12 animate-pulse rounded bg-iris-elevated/50" />
            ))}
          </div>
        </div>
      </div>

      <div className="iris-card p-6">
        <div className="mb-4 h-5 w-52 animate-pulse rounded bg-iris-elevated/60" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-8 animate-pulse rounded bg-iris-elevated/50" />
          ))}
        </div>
      </div>
    </div>
  );
}
