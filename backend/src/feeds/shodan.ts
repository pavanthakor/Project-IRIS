import axios from 'axios';
import { BaseFeed } from './baseFeed';
import { FeedResult, IoCType } from '../types';
import { SHODAN_API_KEY } from '../config';
import logger from '../utils/logger';

interface SslSubject {
  readonly CN?: string;
  readonly O?: string;
  readonly C?: string;
}

function parseSslCert(data: Record<string, unknown>): SslSubject | undefined {
  try {
    // Shodan nests this under data[].ssl.cert.subject or at top-level ssl
    const ssl = data.ssl as { cert?: { subject?: SslSubject } } | undefined;
    if (ssl?.cert?.subject) return ssl.cert.subject;

    // Some responses nest under first service banner
    const banners = data.data as Array<{ ssl?: { cert?: { subject?: SslSubject } } }> | undefined;
    if (Array.isArray(banners)) {
      for (const b of banners) {
        if (b?.ssl?.cert?.subject) return b.ssl.cert.subject;
      }
    }
  } catch { /* ignore parse errors */ }
  return undefined;
}

function parseHttpTitles(data: Record<string, unknown>): string[] {
  try {
    const banners = data.data as Array<{ http?: { title?: string } }> | undefined;
    if (!Array.isArray(banners)) return [];
    return banners
      .map(b => b?.http?.title)
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
      .slice(0, 3);
  } catch { return []; }
}

function buildShodanHostUrl(ioc: string, apiKey: string): URL {
  const url = new URL(`https://api.shodan.io/shodan/host/${ioc}`);
  // Per Shodan API, the key must be provided as a query parameter.
  url.searchParams.set('key', apiKey);
  return url;
}

function maskApiKey(apiKey: string): string {
  if (!apiKey) return '***';
  if (apiKey.length <= 8) return '*'.repeat(apiKey.length);
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

class ShodanFeed extends BaseFeed {
  name = 'Shodan';
  supportedTypes: IoCType[] = ['ip'];

  async query(ioc: string, type: IoCType): Promise<FeedResult> {
    const start = Date.now();

    if (type !== 'ip') {
      return { status: 'failed', feedName: this.name, error: `Unsupported IoC type: ${type}`, latencyMs: Date.now() - start };
    }
    if (!SHODAN_API_KEY) {
      return { status: 'disabled', feedName: this.name, error: 'API key not configured', latencyMs: 0 };
    }

    const requestUrl = buildShodanHostUrl(ioc, SHODAN_API_KEY);
    const maskedRequestUrl = buildShodanHostUrl(ioc, maskApiKey(SHODAN_API_KEY));

    logger.info('shodan_request_uri', {
      feedName: this.name,
      requestUri: maskedRequestUrl.toString(),
    });

    try {
      const response = await axios.get(requestUrl.toString(), { timeout: 8000 });

      const data = response.data as Record<string, unknown>;
      if (!data) {
        return { status: 'failed', feedName: this.name, error: 'Unexpected response format', latencyMs: Date.now() - start };
      }

      const vulns     = (data.vulns     as string[]  | undefined) ?? [];
      const ports     = (data.ports     as number[]  | undefined) ?? [];
      const hostnames = (data.hostnames as string[]  | undefined) ?? [];
      const domains   = (data.domains   as string[]  | undefined) ?? [];

      const confidenceScore = vulns.length ? Math.min(vulns.length * 20, 100) : 0;

      const sslCert    = parseSslCert(data);
      const httpTitles = parseHttpTitles(data);

      return {
        status:          'success',
        feedName:        this.name,
        latencyMs:       Date.now() - start,
        confidenceScore,
        tags: [
          ...vulns,
          ...ports.map(p => `port:${p}`),
        ],
        data: {
          ports,
          vulns,
          os:        data.os   as string | undefined,
          hostnames,
          domains,
          httpTitles,
          sslCertSubject: sslCert
            ? { cn: sslCert.CN, org: sslCert.O, country: sslCert.C }
            : undefined,
        },
        geo: {
          country: data.country_code as string | undefined,
          city:    data.city         as string | undefined,
          org:     data.org          as string | undefined,
          asn:     data.asn ? `AS${data.asn as string | number}` : undefined,
        },
        rawData: response.data,
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return {
            status: 'success', feedName: this.name, latencyMs: Date.now() - start,
            detections: 0, confidenceScore: 0, tags: [], rawData: null,
          };
        }

        if (error.response?.status === 401 || error.response?.status === 403) {
          return {
            status: 'failed',
            feedName: this.name,
            error: 'Shodan API key invalid or insufficient permissions',
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

export const shodanFeed = new ShodanFeed();
