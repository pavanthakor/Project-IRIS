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

      const attributes = response.data?.data?.attributes;
      if (!attributes?.last_analysis_stats) {
        return { status: 'failed', feedName: this.name, error: 'Unexpected response format', latencyMs: Date.now() - start };
      }

      const stats       = attributes.last_analysis_stats;
      const malicious   = stats.malicious   ?? 0;
      const suspicious  = stats.suspicious  ?? 0;
      const harmless    = stats.harmless    ?? 0;
      const undetected  = stats.undetected  ?? 0;

      const detections    = malicious + suspicious;
      const totalEngines  = detections + harmless + undetected;
      const confidenceScore = totalEngines > 0 ? Math.round((detections / totalEngines) * 100) : 0;

      // Community votes
      const votes = attributes.total_votes as { harmless?: number; malicious?: number } | undefined;

      // Last analysis date
      const lastAnalysisTs = attributes.last_analysis_date as number | undefined;

      return {
        status:          'success',
        feedName:        this.name,
        latencyMs:       Date.now() - start,
        detections,
        totalEngines,
        confidenceScore,
        tags:            (attributes.tags as string[] | undefined) ?? [],
        data: {
          reputation:       attributes.reputation as number | undefined,
          lastAnalysisDate: lastAnalysisTs ? new Date(lastAnalysisTs * 1000).toISOString() : undefined,
          communityVotes: {
            harmless:  votes?.harmless  ?? 0,
            malicious: votes?.malicious ?? 0,
          },
          topEngineVerdicts: topEngineVerdicts(
            attributes.last_analysis_results as
              Record<string, { category: string; result: string | null }> | undefined
          ),
        },
        rawData: response.data,
      };
    } catch (error: unknown) {
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

export const virusTotalFeed = new VirusTotalFeed();
