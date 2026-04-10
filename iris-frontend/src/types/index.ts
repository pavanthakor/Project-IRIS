/**
 * IRIS shared types.
 *
 * This file mirrors backend response types from `backend/src/types/index.ts`
 * (excluding Express request augmentation) and extends them with
 * frontend-specific types.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Backend types (mirrored)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Frontend-specific types
// ─────────────────────────────────────────────────────────────────────────────

export interface User {
	id: string;
	email: string;
	tier: 'free' | 'pro' | 'enterprise';
}

export interface AuthState {
	user: User | null;
	token: string | null;
	isAuthenticated: boolean;
	loading: boolean;
}

export type FeedHealth = 'healthy' | 'circuit_open' | 'disabled';

export interface FeedHealthStatus {
	name: string;
	status: FeedHealth;
	endpoint?: string;
	supportedTypes: IoCType[];
	latencyMs?: number;
	p95LatencyMs?: number;
	uptimePercent?: number;
	quotaUsed?: number;
	quotaTotal?: number;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';
export type HealthStatus = 'ok' | 'degraded';

export interface CacheStats {
	hits: number;
	misses: number;
	hitRate: number;
	// Backend currently also returns these; keep optional for forwards/backwards compat.
	errors?: number;
	bgRefreshes?: number;
}

/** Backend feed health metrics returned by GET /health as `feedHealth`. */
export interface FeedHealthMetrics {
	readonly feedName: string;
	readonly requestsLastHour: number;
	readonly successCount: number;
	readonly failureCount: number;
	readonly timeoutCount: number;
	readonly successRate: number;
	readonly avgLatencyMs: number;
	readonly p95LatencyMs: number;
	readonly state: CircuitState;
	readonly lastSuccessAt: string | null;
	readonly lastFailureAt: string | null;
}

export interface HealthResponse {
	status: HealthStatus;
	uptime: number;
	timestamp: string;
	db: ConnectionStatus;
	redis: ConnectionStatus;
	feeds: Record<string, FeedHealth>;
	version: string;
	cache?: CacheStats;

	// Extra fields the backend currently includes.
	overall?: SystemStatus['overall'];
	feedHealth?: Record<string, FeedHealthMetrics>;
}

export type ReportFormat = 'pdf' | 'json' | 'csv';

export interface ReportConfig {
	type: 'incident' | 'summary' | 'watchlist' | 'mitre';
	selectedIoCs: string[];
	sections: {
		executiveSummary: boolean;
		iocDetails: boolean;
		feedResults: boolean;
		mitreMapping: boolean;
		riskBreakdown: boolean;
		recommendations: boolean;
		rawJson: boolean;
	};
	title: string;
	analyst: string;
	classification: 'TLP:WHITE' | 'TLP:GREEN' | 'TLP:AMBER' | 'TLP:RED';
	format: ReportFormat;
}

export interface HistoryFilters {
	search: string;
	type: IoCType | 'all';
	riskLevel: RiskLevel | 'all';
	dateFrom?: string;
	dateTo?: string;
	sortBy: 'date' | 'score';
	sortOrder: 'asc' | 'desc';
}

export interface HistoryStats {
	totalQueries: number;
	highRiskCount: number;
	avgLatency: number;
	cacheHits: number;
}
