export type IoCType = 'ip' | 'domain' | 'hash' | 'email';

export interface IoCInput {
  readonly ioc: string;
  readonly type: IoCType;
}

export type FeedStatus =
  | 'success'
  | 'failed'
  | 'timeout'
  | 'cached'
  | 'circuit_open'
  | 'disabled'
  | 'unsupported';

export interface FeedResult {
  readonly feedName: string;
  readonly status: FeedStatus;
  readonly data?: Record<string, unknown>;
  readonly detections?: number;
  readonly totalEngines?: number;
  readonly confidenceScore?: number;
  readonly tags?: readonly string[];
  readonly malwareFamily?: string;
  readonly latencyMs: number;
  readonly error?: string;
  readonly rawData?: unknown;
  readonly geo?: {
    country?: string;
    city?: string;
    org?: string;
    asn?: string;
  };
}

export interface MitreTechnique {
  readonly id: string;
  readonly name: string;
  readonly tactic: string;
  readonly description?: string;
}

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'UNKNOWN';
export type Verdict = 'Malicious' | 'Suspicious' | 'Clean' | 'Unknown';

export interface GeoLocation {
  readonly country?: string;
  readonly city?: string;
  readonly asn?: string;
  readonly org?: string;
}

/** Attached to query responses when one or more subsystems are degraded. */
export interface SystemStatus {
  readonly overall: 'healthy' | 'degraded' | 'critical';
  readonly limitations: readonly string[];
}

export interface ThreatProfile {
  readonly queryId: string;
  readonly ioc: string;
  readonly type: IoCType;
  readonly riskScore: number;
  readonly riskLevel: RiskLevel;
  readonly verdict: Verdict;
  readonly feeds: readonly FeedResult[];
  readonly mitreTechniques: readonly MitreTechnique[];
  readonly geoLocation?: GeoLocation;
  readonly cachedAt: string | null;
  readonly queryDurationMs: number;
  /** Detected hash algorithm — present only when type === 'hash' */
  readonly hashType?: 'md5' | 'sha1' | 'sha256';
  /** Suggested correct domain when the email domain looks like a typo */
  readonly typoSuggestion?: string;
  /** Present when one or more subsystems are degraded. Omitted when everything is healthy. */
  readonly systemStatus?: SystemStatus;
}

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
  readonly requestId: string;
}

export interface ApiErrorResponse {
  readonly error: ApiError;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'RECOVERING';

export interface CircuitBreakerConfig {
  readonly failureThreshold: number;
  readonly resetTimeoutMs: number;
  readonly feedName: string;
}

export interface UserPayload {
  readonly id: string;
  readonly email: string;
  readonly tier: 'free' | 'pro' | 'enterprise';
  /** JWT ID — present for JWT-authenticated requests, absent for API-key requests. */
  readonly jti?: string;
}

export interface QueryHistoryItem {
  readonly id: string;
  readonly iocValue: string;
  readonly iocType: IoCType;
  readonly riskScore: number | null;
  readonly queriedAt: string;
}

export interface PaginatedHistory {
  readonly items: readonly QueryHistoryItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

// Express request augmentation (module augmentation keeps linting happy)
declare module 'express-serve-static-core' {
  interface Request {
    user?: UserPayload;
    requestId?: string;
  }
}