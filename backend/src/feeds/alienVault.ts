import axios from 'axios';
import { BaseFeed } from './baseFeed';
import { FeedResult, IoCType } from '../types';
import { OTX_API_KEY } from '../config';

const BASE_URL = 'https://otx.alienvault.com/api/v1';

export class AlienVaultFeed extends BaseFeed {
  public readonly name = 'AlienVault OTX';
  public readonly supportedTypes: readonly IoCType[] = ['domain', 'ip'];

  async query(ioc: string, type: IoCType): Promise<FeedResult> {
    const start = Date.now();

    if (!OTX_API_KEY) {
      return {
        status: 'disabled',
        feedName: this.name,
        latencyMs: Date.now() - start,
        error: 'OTX_API_KEY not configured',
      };
    }

    if (!this.supportsType(type)) {
      return {
        status: 'unsupported',
        feedName: this.name,
        latencyMs: Date.now() - start,
      };
    }

    try {
      const endpoint = type === 'domain' ? 'domain' : 'IPv4';
      const response = await axios.get(`${BASE_URL}/indicators/${endpoint}/${ioc}/general`, {
        headers: { 'X-OTX-API-KEY': OTX_API_KEY },
        timeout: 10000,
      });

      const data = response.data;
      const pulseCount = typeof data.pulse_info?.count === 'number' ? data.pulse_info.count : 0;
      const tags: string[] = [];
      const malwareFamilies = new Set<string>();

      if (Array.isArray(data.pulse_info?.pulses)) {
        for (const pulse of data.pulse_info.pulses) {
          if (Array.isArray(pulse.tags)) {
            tags.push(...pulse.tags.filter((t: unknown) => typeof t === 'string'));
          }
          if (Array.isArray(pulse.malware_families)) {
            pulse.malware_families.forEach((m: unknown) => {
              if (typeof m === 'string') malwareFamilies.add(m);
            });
          }
        }
      }

      const uniqueTags = [...new Set(tags)];
      const malwareFamily = malwareFamilies.size > 0 ? Array.from(malwareFamilies)[0] : undefined;

      let confidenceScore = 0;
      if (pulseCount > 10) {
        confidenceScore = Math.min(90, 50 + pulseCount);
      } else if (pulseCount > 3) {
        confidenceScore = 40 + pulseCount * 5;
      } else if (pulseCount > 0) {
        confidenceScore = 20 + pulseCount * 5;
      }

      return {
        feedName: this.name,
        status: 'success',
        latencyMs: Date.now() - start,
        confidenceScore,
        tags: uniqueTags,
        malwareFamily,
        data: {
          pulseCount,
          reputation: data.reputation ?? 0,
          whois: data.whois,
        },
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return {
            feedName: this.name,
            status: 'success',
            latencyMs: Date.now() - start,
            confidenceScore: 0,
            tags: [],
            data: { pulseCount: 0 },
          };
        }
        if (error.response?.status === 403) {
          return {
            status: 'failed',
            feedName: this.name,
            latencyMs: Date.now() - start,
            error: 'Invalid API key',
          };
        }
      }
      return {
        status: 'failed',
        feedName: this.name,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

export const alienVaultFeed = new AlienVaultFeed();
