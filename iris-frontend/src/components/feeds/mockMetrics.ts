import type { UptimeDayStatus } from './types';

// TODO: implement backend /admin/metrics endpoint for real data

type MockFeedMetrics = {
  uptimePercent30d: number;
  quotaUsed: number;
  quotaTotal: number | null;
  avgLatencyMs: number;
  p95LatencyMs: number;
};

const DEFAULT_MOCKS: Record<string, MockFeedMetrics> = {
  VirusTotal: {
    uptimePercent30d: 99.2,
    quotaUsed: 312,
    quotaTotal: 500,
    avgLatencyMs: 1450,
    p95LatencyMs: 2800,
  },
  AbuseIPDB: {
    uptimePercent30d: 99.8,
    quotaUsed: 148,
    quotaTotal: 1000,
    avgLatencyMs: 1120,
    p95LatencyMs: 1200,
  },
  Shodan: {
    uptimePercent30d: 98.1,
    quotaUsed: 220,
    quotaTotal: null,
    avgLatencyMs: 2850,
    p95LatencyMs: 4200,
  },
  IPInfo: {
    uptimePercent30d: 99.5,
    quotaUsed: 55,
    quotaTotal: null,
    avgLatencyMs: 640,
    p95LatencyMs: 1600,
  },
  AbstractEmail: {
    uptimePercent30d: 96.4,
    quotaUsed: 45,
    quotaTotal: 500,
    avgLatencyMs: 3800,
    p95LatencyMs: 7200,
  },
};

function pickMock(feedName: string): MockFeedMetrics {
  return DEFAULT_MOCKS[feedName] ?? {
    uptimePercent30d: 99.0,
    quotaUsed: 0,
    quotaTotal: null,
    avgLatencyMs: 1200,
    p95LatencyMs: 2500,
  };
}

function makeUptimeHistory(percent: number): UptimeDayStatus[] {
  // Deterministic-ish: derive a simple pattern from the percent.
  const history: UptimeDayStatus[] = Array.from({ length: 30 }, () => 'good');

  const clamped = Math.max(0, Math.min(100, percent));
  const deficit = 100 - clamped;

  // Rough heuristic: every 1% deficit → ~1 warn day, every 3% deficit → ~1 bad day.
  const warnDays = Math.max(0, Math.min(10, Math.round(deficit)));
  const badDays = Math.max(0, Math.min(6, Math.floor(deficit / 3)));

  for (let i = 0; i < warnDays; i += 1) {
    const idx = (i * 3 + 7) % history.length;
    history[idx] = 'warn';
  }

  for (let i = 0; i < badDays; i += 1) {
    const idx = (i * 5 + 11) % history.length;
    history[idx] = 'bad';
  }

  return history;
}

export function getMockUptime(feedName: string): { uptimePercent30d: number; uptimeHistory30d: UptimeDayStatus[] } {
  const mock = pickMock(feedName);
  return {
    uptimePercent30d: mock.uptimePercent30d,
    uptimeHistory30d: makeUptimeHistory(mock.uptimePercent30d),
  };
}

export function getMockQuota(feedName: string): { quotaUsed: number; quotaTotal: number | null } {
  const mock = pickMock(feedName);
  return { quotaUsed: mock.quotaUsed, quotaTotal: mock.quotaTotal };
}

export function getMockLatency(feedName: string): { avgLatencyMs: number; p95LatencyMs: number } {
  const mock = pickMock(feedName);
  return { avgLatencyMs: mock.avgLatencyMs, p95LatencyMs: mock.p95LatencyMs };
}

export function getMockQuotaSummary(): { percentLabel: string; detailLabel: string } {
  // Matches the screenshot sample. Separate from per-feed quotas.
  // TODO: implement backend /admin/metrics endpoint for real data
  return {
    percentLabel: '34%',
    detailLabel: '412 of 1200 calls',
  };
}
