import axios from 'axios';
import { BaseFeed } from './baseFeed';
import { FeedResult, IoCType } from '../types';
import { ABUSEIPDB_API_KEY } from '../config';

type AbuseIPDBQuotaCache = {
  readonly remaining: number | null;
  readonly total: number | null;
  readonly fetchedAt: number;
};

export interface AbuseIPDBQuotaSnapshot {
  readonly remaining: number | null;
  readonly total: number | null;
  readonly updatedAt: string | null;
  readonly source: 'provider-or-cache' | 'unknown';
}

const ABUSEIPDB_DEFAULT_TOTAL = 1000;
let quotaCache: AbuseIPDBQuotaCache | null = null;

// https://www.abuseipdb.com/categories
const ABUSE_CATEGORY_NAMES: Record<number, string> = {
  1:  'DNS Compromise',
  2:  'DNS Poisoning',
  3:  'Fraud Orders',
  4:  'DDoS Attack',
  5:  'FTP Brute-Force',
  6:  'Ping of Death',
  7:  'Phishing',
  8:  'Fraud VoIP',
  9:  'Open Proxy',
  10: 'Web Spam',
  11: 'Email Spam',
  12: 'Blog Spam',
  13: 'VPN IP',
  14: 'Port Scan',
  15: 'Hacking',
  16: 'SQL Injection',
  17: 'Spoofing',
  18: 'Brute-Force',
  19: 'Bad Web Bot',
  20: 'Exploited Host',
  21: 'Web App Attack',
  22: 'SSH',
  23: 'IoT Targeted',
};

interface AbuseReport {
  readonly reportedAt: string;
  readonly comment: string | null;
  readonly categories: string[];
  readonly reporterCountryCode: string | null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (Array.isArray(value) && value.length > 0) {
    return toFiniteNumber(value[0]);
  }
  return null;
}

function getHeaderNumber(headers: Record<string, unknown> | undefined, name: string): number | null {
  if (!headers) return null;

  const direct = headers[name];
  if (direct !== undefined) return toFiniteNumber(direct);

  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return toFiniteNumber(value);
  }
  return null;
}

function updateQuotaFromHeaders(headers: Record<string, unknown> | undefined): void {
  const remaining = getHeaderNumber(headers, 'x-ratelimit-remaining');
  const total = getHeaderNumber(headers, 'x-ratelimit-limit');

  if (remaining === null && total === null) return;

  quotaCache = {
    remaining,
    total: total ?? quotaCache?.total ?? ABUSEIPDB_DEFAULT_TOTAL,
    fetchedAt: Date.now(),
  };
}

export async function getAbuseIPDBQuotaSnapshot(): Promise<AbuseIPDBQuotaSnapshot> {
  if (!quotaCache) {
    return {
      remaining: ABUSEIPDB_DEFAULT_TOTAL,
      total: ABUSEIPDB_DEFAULT_TOTAL,
      updatedAt: null,
      source: 'unknown',
    };
  }

  if (quotaCache.remaining === null) {
    return {
      remaining: quotaCache.total ?? ABUSEIPDB_DEFAULT_TOTAL,
      total: quotaCache?.total ?? ABUSEIPDB_DEFAULT_TOTAL,
      updatedAt: quotaCache ? new Date(quotaCache.fetchedAt).toISOString() : null,
      source: 'unknown',
    };
  }

  return {
    remaining: quotaCache.remaining,
    total: quotaCache.total ?? ABUSEIPDB_DEFAULT_TOTAL,
    updatedAt: new Date(quotaCache.fetchedAt).toISOString(),
    source: 'provider-or-cache',
  };
}

function parseReports(
  raw: Array<{
    reportedAt?: string;
    comment?: string;
    categories?: number[];
    reporterCountryCode?: string;
  }> | undefined
): AbuseReport[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).map(r => ({
    reportedAt:          r.reportedAt ?? '',
    comment:             r.comment    ?? null,
    categories:          (r.categories ?? []).map(c => ABUSE_CATEGORY_NAMES[c] ?? `Category ${c}`),
    reporterCountryCode: r.reporterCountryCode ?? null,
  }));
}

class AbuseIPDBFeed extends BaseFeed {
  name = 'AbuseIPDB';
  supportedTypes: IoCType[] = ['ip'];

  async query(ioc: string, type: IoCType): Promise<FeedResult> {
    const start = Date.now();

    if (type !== 'ip') {
      return { status: 'failed', feedName: this.name, error: `Unsupported IoC type: ${type}`, latencyMs: Date.now() - start };
    }
    if (!ABUSEIPDB_API_KEY) {
      return { status: 'disabled', feedName: this.name, error: 'API key not configured', latencyMs: 0 };
    }

    try {
      const response = await axios.get('https://api.abuseipdb.com/api/v2/check', {
        params: { ipAddress: ioc, maxAgeInDays: 90, verbose: true },
        headers: { 'Key': ABUSEIPDB_API_KEY, 'Accept': 'application/json' },
        timeout: 8000,
      });

      updateQuotaFromHeaders(response.headers as Record<string, unknown> | undefined);

      const data = response.data?.data;
      if (!data) {
        return { status: 'failed', feedName: this.name, error: 'Unexpected response format', latencyMs: Date.now() - start };
      }

      return {
        status:          'success',
        feedName:        this.name,
        latencyMs:       Date.now() - start,
        confidenceScore: data.abuseConfidenceScore as number,
        tags:            [data.usageType as string].filter(Boolean),
        data: {
          totalReports:  data.totalReports  as number,
          distinctUsers: data.numDistinctUsers as number,
          isWhitelisted: data.isWhitelisted  as boolean,
          isp:           data.isp           as string | undefined,
          domain:        data.domain        as string | undefined,
          recentReports: parseReports(
            data.reports as Array<{
              reportedAt?: string; comment?: string;
              categories?: number[]; reporterCountryCode?: string;
            }> | undefined
          ),
        },
        geo: {
          country: data.countryCode as string | undefined,
          org:     data.isp         as string | undefined,
        },
        rawData: response.data,
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        updateQuotaFromHeaders(error.response?.headers as Record<string, unknown> | undefined);
      }
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return {
          status: 'success', feedName: this.name, latencyMs: Date.now() - start,
          detections: 0, totalEngines: 0, confidenceScore: 0, tags: [], rawData: null,
        };
      }
      return {
        status:    'failed',
        feedName:  this.name,
        error:     error instanceof Error ? error.message : 'unknown',
        latencyMs: Date.now() - start,
      };
    }
  }
}

export const abuseIPDBFeed = new AbuseIPDBFeed();
