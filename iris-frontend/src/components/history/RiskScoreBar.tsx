import clsx from 'clsx';

interface RiskScoreBarProps {
  score: number | null | undefined;
  className?: string;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreFillClass(score: number): string {
  if (score < 20) return 'bg-slate-500';
  if (score < 40) return 'bg-iris-success';
  if (score < 60) return 'bg-yellow-400';
  if (score < 80) return 'bg-orange-400';
  return 'bg-iris-danger';
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

export default function RiskScoreBar({ score, className }: RiskScoreBarProps) {
  if (typeof score !== 'number') {
    return (
      <div className={clsx('flex items-center gap-3', className)}>
        <div className="h-1.5 flex-1 rounded-full bg-iris-border/60" />
        <span className="w-10 text-right font-mono text-sm text-iris-text-dim">—</span>
      </div>
    );
  }

  const s = clampScore(score);
  const widthBucket = Math.max(0, Math.min(20, Math.round(s / 5)));

  return (
    <div className={clsx('flex items-center gap-3', className)}>
      <div className="h-1.5 flex-1 rounded-full bg-iris-border/60">
        <div
          className={clsx('h-full rounded-full transition-all duration-300', scoreFillClass(s), WIDTH_CLASSES[widthBucket])}
          aria-hidden="true"
        />
      </div>
      <span className="w-10 text-right font-mono text-sm text-iris-text">{s}</span>
    </div>
  );
}
