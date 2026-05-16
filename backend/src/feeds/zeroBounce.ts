import axios from 'axios';
import dns from 'node:dns/promises';
import { BaseFeed } from './baseFeed';
import { FeedResult, IoCType } from '../types';
import { ZEROBOUNCE_API_KEY } from '../config';
import { validateEmail } from '../utils/validators';

type ZeroBounceResponse = Record<string, unknown>;

type CreditCache = {
  readonly credits: number | null;
  readonly fetchedAt: number;
};

export interface ZeroBounceQuotaSnapshot {
  readonly remaining: number | null;
  readonly total: number | null;
  readonly updatedAt: string | null;
  readonly source: 'provider-or-cache' | 'unknown';
}

const VALIDATE_URL = 'https://api.zerobounce.net/v2/validate';
const CREDITS_URL = 'https://api.zerobounce.net/v2/getcredits';
const CREDIT_TTL_MS = 10 * 60 * 1000;
const ZEROBOUNCE_DEFAULT_TOTAL = 100;

let creditCache: CreditCache | null = null;

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractCredits(payload: unknown): number | null {
  if (typeof payload === 'number' || typeof payload === 'string') {
    return toNumber(payload);
  }

  if (typeof payload === 'object' && payload !== null) {
    const record = payload as Record<string, unknown>;
    const candidates = [
      record.credits,
      record.Credits,
      record.remaining_credits,
      record.remainingCredits,
      record.credits_remaining,
      record.CreditsRemaining,
      record.credit_count,
    ];

    for (const candidate of candidates) {
      const parsed = toNumber(candidate);
      if (parsed !== null) return parsed;
    }
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined;
}

function toBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
}

function buildMxList(records: ReadonlyArray<{ exchange?: string; preference?: number }> | undefined): string[] {
  if (!Array.isArray(records)) return [];
  return [...records]
    .filter((entry): entry is { exchange?: string; preference?: number } => !!entry)
    .sort((a, b) => (a.preference ?? 0) - (b.preference ?? 0))
    .map(entry => entry.exchange)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);
}

async function getCachedCredits(): Promise<number | null> {
  if (!ZEROBOUNCE_API_KEY) return null;

  const now = Date.now();
  if (creditCache && now - creditCache.fetchedAt < CREDIT_TTL_MS) {
    return creditCache.credits;
  }

  try {
    const response = await axios.get(CREDITS_URL, {
      params: { api_key: ZEROBOUNCE_API_KEY },
      timeout: 8000,
    });

    const credits = extractCredits(response.data);
    creditCache = { credits, fetchedAt: now };
    return credits;
  } catch {
    return creditCache?.credits ?? null;
  }
}

export async function getZeroBounceQuotaSnapshot(): Promise<ZeroBounceQuotaSnapshot> {
  const remaining = await getCachedCredits();
  if (remaining === null) {
    return {
      remaining: null,
      total: ZEROBOUNCE_DEFAULT_TOTAL,
      updatedAt: creditCache ? new Date(creditCache.fetchedAt).toISOString() : null,
      source: 'unknown',
    };
  }

  return {
    remaining,
    total: ZEROBOUNCE_DEFAULT_TOTAL,
    updatedAt: creditCache ? new Date(creditCache.fetchedAt).toISOString() : null,
    source: 'provider-or-cache',
  };
}

async function resolveMxRecords(domain: string): Promise<string[]> {
  try {
    const records = await dns.resolveMx(domain);
    return buildMxList(records);
  } catch {
    return [];
  }
}

function buildLocalResult(email: string, latencyMs: number): FeedResult {
  const validation = validateEmail(email);

  if (!validation.valid) {
    return {
      status: 'failed',
      feedName: 'ZeroBounce',
      error: validation.error ?? 'Invalid email address',
      latencyMs,
      data: {
        validationMode: 'local-fallback',
        reason: 'syntax-check-failed',
        normalized: validation.normalized,
        typoSuggestion: validation.typoSuggestion,
      },
      rawData: { source: 'local-fallback' },
    };
  }

  const normalized = validation.normalized ?? email.trim().toLowerCase();
  const [, domain = ''] = normalized.split('@');

  return {
    status: 'success',
    feedName: 'ZeroBounce',
    latencyMs,
    confidenceScore: validation.typoSuggestion ? 35 : 15,
    tags: [validation.typoSuggestion ? 'typo-suggestion' : 'local-fallback'],
    data: {
      validationMode: 'local-fallback',
      normalized,
      typoSuggestion: validation.typoSuggestion,
      domain,
      mxFound: null,
      freeEmail: null,
      localValidation: true,
    },
    rawData: { source: 'local-fallback' },
  };
}

function buildProviderResult(email: string, payload: ZeroBounceResponse, latencyMs: number): FeedResult {
  const status = typeof payload.status === 'string' ? payload.status.toLowerCase() : 'unknown';
  const subStatus = typeof payload.sub_status === 'string' ? payload.sub_status : undefined;
  const didYouMean = typeof payload.did_you_mean === 'string' ? payload.did_you_mean : undefined;
  const freeEmail = toBool(payload.free_email);
  const mxFound = toBool(payload.mx_found);
  const account = asRecord(payload.account);
  const domain = asRecord(payload.domain);

  const tags: string[] = ['zerobounce'];
  if (freeEmail === true) tags.push('free-email');
  if (mxFound === false) tags.push('no-mx-record');
  if (status === 'invalid') tags.push('invalid');
  if (status === 'catch-all') tags.push('catch-all');
  if (didYouMean) tags.push('typo-suggestion');

  const confidenceScore =
    status === 'valid' ? 5 :
    status === 'catch-all' ? 45 :
    status === 'invalid' ? 90 :
    25;

  return {
    status: 'success',
    feedName: 'ZeroBounce',
    latencyMs,
    confidenceScore,
    tags,
    detections: status === 'invalid' ? 1 : 0,
    data: {
      validationMode: 'zerobounce',
      status,
      subStatus,
      didYouMean,
      freeEmail,
      mxFound,
      account: account ? { name: account.name, domain: account.domain } : undefined,
      domain: domain ? { name: domain.name, age: domain.age, country: domain.country } : undefined,
      input: email,
    },
    rawData: payload,
  };
}

class ZeroBounceFeed extends BaseFeed {
  name = 'ZeroBounce';
  supportedTypes: IoCType[] = ['email'];

  async query(ioc: string, type: IoCType): Promise<FeedResult> {
    const start = Date.now();

    if (type !== 'email') {
      return { status: 'failed', feedName: this.name, error: `Unsupported IoC type: ${type}`, latencyMs: Date.now() - start };
    }

    const validation = validateEmail(ioc);
    if (!validation.valid) {
      return buildLocalResult(ioc, Date.now() - start);
    }

    const credits = await getCachedCredits();
    if (credits === null || credits <= 0 || !ZEROBOUNCE_API_KEY) {
      return buildLocalResult(ioc, Date.now() - start);
    }

    try {
      const response = await axios.get(VALIDATE_URL, {
        params: {
          api_key: ZEROBOUNCE_API_KEY,
          email: validation.normalized ?? ioc.trim().toLowerCase(),
        },
        timeout: 8000,
      });

      creditCache = { credits: Math.max(0, credits - 1), fetchedAt: Date.now() };
      return buildProviderResult(ioc, response.data as ZeroBounceResponse, Date.now() - start);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 402 || status === 429) {
          creditCache = { credits: 0, fetchedAt: Date.now() };
        }
      }
      return buildLocalResult(ioc, Date.now() - start);
    }
  }
}

export const zeroBounceFeed = new ZeroBounceFeed();