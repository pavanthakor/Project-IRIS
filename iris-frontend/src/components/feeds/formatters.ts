function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function endpointHost(endpointUrl: string): string {
  try {
    return new URL(endpointUrl).hostname;
  } catch {
    return endpointUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }
}

export function formatSeconds(ms: number | null | undefined, decimals = 2): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '—';
  const s = ms / 1000;
  return `${s.toFixed(decimals)}s`;
}

export function latencyTone(ms: number | null | undefined): 'normal' | 'warn' | 'bad' {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return 'normal';
  if (ms >= 7000) return 'bad';
  if (ms >= 5000) return 'warn';
  return 'normal';
}

export function quotaPercent(used: number, total: number | null): number {
  if (!Number.isFinite(used) || used < 0) return 0;
  if (total === null) {
    // Unknown/infinite quota: show a steady, non-alarming fill.
    return 65;
  }
  if (!Number.isFinite(total) || total <= 0) return 0;
  return clamp((used / total) * 100, 0, 100);
}

export const WIDTH_CLASSES = [
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

export function widthBucket(percent: number): number {
  const p = clamp(percent, 0, 100);
  return clamp(Math.round(p / 5), 0, 20);
}
