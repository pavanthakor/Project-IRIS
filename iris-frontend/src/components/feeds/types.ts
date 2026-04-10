import type { CircuitState, FeedHealth, IoCType } from '../../types';

export type FeedOperationalStatus = 'operational' | 'degraded' | 'outage';

export type UptimeDayStatus = 'good' | 'warn' | 'bad';

export interface FeedRowModel {
  name: string;
  endpointHost: string;
  endpointUrl: string;
  supportedTypes: readonly IoCType[];

  /** Raw backend health value from GET /health `feeds` record. */
  health: FeedHealth | 'unknown';

  /** UI-friendly operational state. */
  operationalStatus: FeedOperationalStatus;
  statusLabel: 'Operational' | 'Degraded' | 'Outage' | 'Unknown';

  avgLatencyMs: number | null;
  p95LatencyMs: number | null;

  circuitState: CircuitState | null;

  /** Mocked for now (backend doesn't expose 30-day uptime series). */
  uptimePercent30d: number;
  uptimeHistory30d: readonly UptimeDayStatus[];

  /** Mocked for now (backend doesn't expose per-feed quota usage). */
  quotaUsed: number;
  quotaTotal: number | null;
}
