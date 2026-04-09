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

export interface GeoLocation {
  country?: string;
  city?: string;
  org?: string;
  asn?: string;
}

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

export interface SystemStatus {
  overall: 'healthy' | 'degraded' | 'critical';
  limitations: string[];
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
  systemStatus?: SystemStatus;
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

export interface ApiErrorResponse {
  error: { code: string; message: string; requestId?: string };
}
