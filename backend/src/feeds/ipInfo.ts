import axios from 'axios';
import { BaseFeed } from './baseFeed';
import { FeedResult, IoCType } from '../types';
import { IPINFO_API_KEY } from '../config';

const PRIVACY_KEYS = ['vpn', 'proxy', 'tor', 'relay', 'hosting'] as const;
const ANON_ORG_KEYWORDS = [
  'tor',
  'exit',
  'relay',
  'anonymous',
  'vpn',
  'proxy',
  'mullvad',
  'nordvpn',
  'expressv',
] as const;
const HOSTING_ORG_KEYWORDS = ['hosting', 'datacenter', 'server'] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function hasPrivacyFlags(privacy: Record<string, unknown> | undefined): boolean {
  if (!privacy) return false;
  return PRIVACY_KEYS.some((key) => typeof privacy[key] === 'boolean');
}

function hasKeyword(haystack: string, keywords: readonly string[]): boolean {
  const normalized = haystack.toLowerCase();
  return keywords.some((k) => normalized.includes(k));
}

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

      const asnRecord = asRecord(data.asn);
      const asn = {
        asn: typeof asnRecord?.asn === 'string' ? asnRecord.asn : undefined,
        name: typeof asnRecord?.name === 'string' ? asnRecord.name : undefined,
        route: typeof asnRecord?.route === 'string' ? asnRecord.route : undefined,
        type: typeof asnRecord?.type === 'string' ? asnRecord.type : undefined,
      };

      const org = typeof data.org === 'string' ? data.org : '';
      const privacy = asRecord(data.privacy);
      const privacyHasFlags = hasPrivacyFlags(privacy);

      let tags: string[] = [];
      let confidenceScore = 0;

      if (data.bogon === true) {
        tags = ['bogon'];
        confidenceScore = 0;
      } else if (privacyHasFlags) {
        const vpn = privacy?.vpn === true;
        const proxy = privacy?.proxy === true;
        const tor = privacy?.tor === true;
        const relay = privacy?.relay === true;
        const hosting = privacy?.hosting === true;

        if (vpn) tags.push('vpn');
        if (proxy) tags.push('proxy');
        if (tor) tags.push('tor');
        if (relay) tags.push('relay');
        if (hosting) tags.push('hosting');

        // Existing privacy-based scoring (kept as-is)
        if (tor) confidenceScore = Math.max(confidenceScore, 80);
        if (proxy) confidenceScore = Math.max(confidenceScore, 60);
        if (vpn) confidenceScore = Math.max(confidenceScore, 50);
        if (hosting) confidenceScore = Math.max(confidenceScore, 30);
      } else {
        const searchableOrg = org;
        const searchableAsnName = asn.name ?? '';
        const searchableHostname = typeof data.hostname === 'string' ? data.hostname : '';

        const isAnonymousNetwork =
          hasKeyword(searchableOrg, ANON_ORG_KEYWORDS) ||
          hasKeyword(searchableAsnName, ANON_ORG_KEYWORDS) ||
          hasKeyword(searchableHostname, ANON_ORG_KEYWORDS);

        const isHosting = hasKeyword(searchableOrg, HOSTING_ORG_KEYWORDS);

        if (isAnonymousNetwork) {
          confidenceScore = 60;
          tags = ['anonymous-network'];
        } else if (isHosting) {
          confidenceScore = 30;
          tags = ['hosting'];
        }
      }

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
          org:      org || undefined,
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
          org:     org || undefined,
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
