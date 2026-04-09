import axios from 'axios';
import { BaseFeed } from './baseFeed';
import { FeedResult, IoCType } from '../types';
import { IPINFO_API_KEY } from '../config';

class IPInfoFeed extends BaseFeed {
  name = 'IPInfo';
  supportedTypes: IoCType[] = ['ip'];

  async query(ioc: string, type: IoCType): Promise<FeedResult> {
    const start = Date.now();

    if (type !== 'ip') {
      return { status: 'failed', feedName: this.name, error: `Unsupported IoC type: ${type}`, latencyMs: Date.now() - start };
    }
    if (!IPINFO_API_KEY) {
      return { status: 'disabled', feedName: 'IPInfo', error: 'API key not configured', latencyMs: 0 };
    }

    try {
      const response = await axios.get(`https://ipinfo.io/${ioc}?token=${IPINFO_API_KEY}`, {
        timeout: 8000,
      });

      const data = response.data as Record<string, unknown>;
      if (!data) {
        return { status: 'failed', feedName: this.name, error: 'Unexpected response format', latencyMs: Date.now() - start };
      }

      const privacy = data.privacy as Record<string, boolean> | undefined ?? {};
      const tags: string[] = [];
      if (privacy.vpn)     tags.push('vpn');
      if (privacy.proxy)   tags.push('proxy');
      if (privacy.tor)     tags.push('tor');
      if (privacy.relay)   tags.push('relay');
      if (privacy.hosting) tags.push('hosting');

      let confidenceScore = 0;
      if (privacy.tor)     confidenceScore = Math.max(confidenceScore, 80);
      if (privacy.proxy)   confidenceScore = Math.max(confidenceScore, 60);
      if (privacy.vpn)     confidenceScore = Math.max(confidenceScore, 50);
      if (privacy.hosting) confidenceScore = Math.max(confidenceScore, 30);

      const asn     = data.asn     as Record<string, string> | undefined ?? {};
      const company = data.company as Record<string, string> | undefined;
      const abuse   = data.abuse   as Record<string, string> | undefined;

      return {
        status:          'success',
        feedName:        this.name,
        latencyMs:       Date.now() - start,
        confidenceScore,
        tags,
        data: {
          hostname: data.hostname as string | undefined,
          org:      data.org      as string | undefined,
          asn:      asn.asn,
          asnName:  asn.name,
          route:    asn.route,
          type:     asn.type,
          company: company
            ? { name: company.name, domain: company.domain, type: company.type }
            : undefined,
          abuse: abuse
            ? { address: abuse.address, email: abuse.email, phone: abuse.phone }
            : undefined,
        },
        geo: {
          country: data.country as string | undefined,
          city:    data.city    as string | undefined,
          org:     data.org     as string | undefined,
          asn:     asn.asn,
        },
        rawData: data,
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 404 || status === 429) {
          return {
            status:    'failed',
            feedName:  this.name,
            error:     `API returned status ${status}`,
            latencyMs: Date.now() - start,
          };
        }
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

export const ipInfoFeed = new IPInfoFeed();
