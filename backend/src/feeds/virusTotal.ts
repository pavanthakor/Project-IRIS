import axios from 'axios';
import { BaseFeed } from './baseFeed';
import { FeedResult, IoCType } from '../types';
import { VIRUSTOTAL_API_KEY } from '../config';

// Top engine families we prefer to surface (deterministic ordering)
const PREFERRED_ENGINES = new Set([
  'Kaspersky', 'Sophos', 'CrowdStrike', 'SentinelOne', 'ClamAV',
  'ESET-NOD32', 'Symantec', 'TrendMicro', 'Malwarebytes', 'McAfee',
  'Microsoft', 'Google', 'Fortinet', 'Palo Alto Networks', 'BitDefender',
]);

interface EngineVerdict {
  readonly engine: string;
  readonly category: string;
  readonly result: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function unixSecondsToIso(value: unknown): string | undefined {
  return typeof value === 'number' ? new Date(value * 1000).toISOString() : undefined;
}

function normalizeCategories(value: unknown): string[] {
  const obj = asRecord(value);
  if (!obj) return [];

  // VT returns { vendorName: "category label", ... }
  const categories = new Set<string>();
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.trim().length > 0) {
      categories.add(v.trim());
    }
  }
  return Array.from(categories).sort((a, b) => a.localeCompare(b));
}

function normalizePopularityRanks(value: unknown): Array<{ source: string; rank?: number }> {
  const obj = asRecord(value);
  if (!obj) return [];

  const ranks: Array<{ source: string; rank?: number }> = [];
  for (const [source, raw] of Object.entries(obj)) {
    const rec = asRecord(raw);
    const rank = rec && typeof rec.rank === 'number' ? rec.rank : undefined;
    ranks.push({ source, rank });
  }

  // Show best ranks first (lowest number)
  ranks.sort((a, b) => (a.rank ?? Number.POSITIVE_INFINITY) - (b.rank ?? Number.POSITIVE_INFINITY));
  return ranks;
}

function normalizeLastDnsRecords(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  const records: Array<Record<string, unknown>> = [];
  for (const entry of value) {
    const rec = asRecord(entry);
    if (!rec) continue;
    // Keep a small, UI-friendly subset.
    const type = typeof rec.type === 'string' ? rec.type : undefined;
    const valueField = typeof rec.value === 'string' ? rec.value : undefined;
    const ttl = typeof rec.ttl === 'number' ? rec.ttl : undefined;
    const priority = typeof rec.priority === 'number' ? rec.priority : undefined;
    records.push({ ...(type ? { type } : {}), ...(valueField ? { value: valueField } : {}), ...(ttl !== undefined ? { ttl } : {}), ...(priority !== undefined ? { priority } : {}) });
    if (records.length >= 25) break;
  }
  return records;
}

function topEngineVerdicts(
  lastAnalysisResults: Record<string, { category: string; result: string | null }> | undefined
): EngineVerdict[] {
  if (!lastAnalysisResults) return [];

  const preferred: EngineVerdict[] = [];
  const others: EngineVerdict[]    = [];

  for (const [engine, v] of Object.entries(lastAnalysisResults)) {
    // Skip undetected / timeout engines unless they're preferred
    if (v.category === 'timeout' || v.category === 'type-unsupported') continue;

    const entry: EngineVerdict = { engine, category: v.category, result: v.result };
    if (PREFERRED_ENGINES.has(engine)) {
      preferred.push(entry);
    } else if (v.category === 'malicious' || v.category === 'suspicious') {
      others.push(entry);
    }
  }

  // Merge: preferred first, then malicious detections, cap at 5
  return [...preferred, ...others].slice(0, 5);
}

class VirusTotalFeed extends BaseFeed {
  name = 'VirusTotal';
  supportedTypes: IoCType[] = ['ip', 'domain', 'hash'];

  async query(ioc: string, type: IoCType): Promise<FeedResult> {
    const start = Date.now();

    if (!VIRUSTOTAL_API_KEY) {
      return { status: 'disabled', feedName: this.name, error: 'API key not configured', latencyMs: 0 };
    }

    let url: string;
    switch (type) {
      case 'ip':     url = `https://www.virustotal.com/api/v3/ip_addresses/${ioc}`; break;
      case 'domain': url = `https://www.virustotal.com/api/v3/domains/${ioc}`;      break;
      case 'hash':   url = `https://www.virustotal.com/api/v3/files/${ioc}`;        break;
      default:
        return { status: 'failed', feedName: this.name, error: `Unsupported IoC type: ${type}`, latencyMs: Date.now() - start };
    }

    try {
      const response = await axios.get(url, {
        headers: { 'x-apikey': VIRUSTOTAL_API_KEY },
        timeout: 8000,
      });

      const vtData = asRecord(response.data)?.data as unknown;
      const vtDataObj = asRecord(vtData);
      const attributes = asRecord(vtDataObj?.attributes);
      const statsObj = asRecord(attributes?.last_analysis_stats);
      if (!statsObj) {
        return { status: 'failed', feedName: this.name, error: 'Unexpected response format', latencyMs: Date.now() - start };
      }

      const malicious   = typeof statsObj.malicious === 'number' ? statsObj.malicious : 0;
      const suspicious  = typeof statsObj.suspicious === 'number' ? statsObj.suspicious : 0;
      const harmless    = typeof statsObj.harmless === 'number' ? statsObj.harmless : 0;
      const undetected  = typeof statsObj.undetected === 'number' ? statsObj.undetected : 0;

      const detections    = malicious + suspicious;
      const totalEngines  = detections + harmless + undetected;
      const confidenceScore = totalEngines > 0 ? Math.round((detections / totalEngines) * 100) : 0;

      // Community votes
      const votesObj = asRecord(attributes?.total_votes);
      const votes = {
        harmless: typeof votesObj?.harmless === 'number' ? votesObj.harmless : 0,
        malicious: typeof votesObj?.malicious === 'number' ? votesObj.malicious : 0,
      };

      // Last analysis date
      const lastAnalysisIso = unixSecondsToIso(attributes?.last_analysis_date);
      const creationDateIso = unixSecondsToIso(attributes?.creation_date);

      const categories = normalizeCategories(attributes?.categories);
      const country = typeof attributes?.country === 'string' ? attributes.country : undefined;
      const tld = typeof attributes?.tld === 'string' ? attributes.tld : undefined;
      const lastDnsRecords = normalizeLastDnsRecords(attributes?.last_dns_records);
      const popularityRanks = normalizePopularityRanks(attributes?.popularity_ranks);
      const tags = asStringArray(attributes?.tags);

      // Raw data can be huge (especially last_analysis_results). Keep a small, stable subset.
      const rawData = {
        data: {
          id: typeof vtDataObj?.id === 'string' ? vtDataObj.id : undefined,
          type: typeof vtDataObj?.type === 'string' ? vtDataObj.type : undefined,
          attributes: {
            reputation: typeof attributes?.reputation === 'number' ? attributes.reputation : undefined,
            tags,
            categories,
            country,
            tld,
            creation_date: creationDateIso,
            last_analysis_date: lastAnalysisIso,
            last_analysis_stats: {
              malicious,
              suspicious,
              harmless,
              undetected,
            },
            total_votes: votes,
            last_dns_records: lastDnsRecords,
            popularity_ranks: popularityRanks,
          },
        },
      };

      return {
        status:          'success',
        feedName:        this.name,
        latencyMs:       Date.now() - start,
        detections,
        totalEngines,
        confidenceScore,
        tags,
        data: {
          reputation:       typeof attributes?.reputation === 'number' ? attributes.reputation : undefined,
          lastAnalysisDate: lastAnalysisIso,
          creationDate:     creationDateIso,
          categories,
          country,
          tld,
          lastDnsRecords,
          popularityRanks,
          communityVotes: {
            harmless:  votes.harmless,
            malicious: votes.malicious,
          },
          topEngineVerdicts: topEngineVerdicts(
            attributes?.last_analysis_results as
              Record<string, { category: string; result: string | null }> | undefined
          ),
        },
        rawData,
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return {
          status:    'failed',
          feedName:  this.name,
          latencyMs: Date.now() - start,
          error:     'Not found in VirusTotal',
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

export const virusTotalFeed = new VirusTotalFeed();
