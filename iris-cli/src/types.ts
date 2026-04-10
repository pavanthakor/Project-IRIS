export type IoCType = 'ip' | 'domain' | 'hash' | 'email';

export type FeedStatus =
  | 'success'
  | 'failed'
  | 'timeout'
  | 'cached'
  | 'circuit_open'
  | 'disabled'
  | 'unsupported';

export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'UNKNOWN';
export type Verdict = 'Malicious' | 'Suspicious' | 'Clean' | 'Unknown';

export interface FeedResult {
  feedName: string;
  status: FeedStatus;
  latencyMs: number;
  confidenceScore?: number;
  detections?: number;
  totalEngines?: number;
  tags?: string[];
  malwareFamily?: string;
  data?: Record<string, unknown>;
  error?: string;
}

export interface MitreTechnique {
  id: string;
  name: string;
  tactic: string;
  description?: string;
}

export interface GeoLocation {
  country?: string;
  city?: string;
  org?: string;
  asn?: string;
}

export interface ThreatProfile {
  queryId: string;
  ioc: string;
  type: IoCType;
  riskScore: number;
  riskLevel: RiskLevel;
  verdict: Verdict;
  feeds: FeedResult[];
  mitreTechniques: MitreTechnique[];
  geoLocation?: GeoLocation | null;
  cachedAt: string | null;
  queryDurationMs: number;
  hashType?: 'md5' | 'sha1' | 'sha256';
  typoSuggestion?: string;
}

export interface QueryHistoryItem {
  id: string;
  iocValue: string;
  iocType: IoCType;
  riskScore: number | null;
  queriedAt: string;
}

export interface PaginatedHistory {
  items: QueryHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuthUser {
  id: string;
  email: string;
  tier: 'free' | 'pro' | 'enterprise' | string;
  token: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | string;
  overall?: 'healthy' | 'degraded' | 'critical' | string;
  uptime: number;
  timestamp: string;
  db: string;
  redis: string;
  feeds: Record<string, string>;
  feedHealth?: Record<string, { state?: string } & Record<string, unknown>>;
  version?: string;
}

export interface IrisConfigStore {
  apiUrl: string;
  token?: string;
  user?: {
    id: string;
    email: string;
    tier: string;
  };
}

export interface GlobalOptions {
  apiUrl?: string;
  token?: string;
  color?: boolean;
  json?: boolean;
}

export interface ResolvedRuntimeOptions {
  apiUrl: string;
  token?: string;
  color: boolean;
  json: boolean;
}

export type GlobalOptionsGetter = () => GlobalOptions;
