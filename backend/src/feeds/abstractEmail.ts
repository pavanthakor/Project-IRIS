import axios from 'axios';
import { BaseFeed } from './baseFeed';
import { FeedResult, IoCType } from '../types';
import { ABSTRACT_EMAIL_API_KEY } from '../config';

interface SmtpDetail {
  readonly valid: boolean;
  readonly reason: string | null;
}

type ApiBoolField =
  | boolean
  | {
      value?: boolean;
      text?: string;
    }
  | undefined
  | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseBoolField(field: ApiBoolField): boolean | undefined {
  if (typeof field === 'boolean') {
    return field;
  }

  if (field && typeof field === 'object' && typeof field.value === 'boolean') {
    return field.value;
  }

  return undefined;
}

function parseNumberField(field: unknown): number | undefined {
  if (typeof field === 'number' && Number.isFinite(field)) {
    return field;
  }

  if (typeof field === 'string') {
    const parsed = Number(field);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function parseSmtpDetail(field: ApiBoolField, fallbackReason?: string | null): SmtpDetail {
  if (typeof field === 'boolean') {
    return {
      valid: field,
      reason: fallbackReason ?? null,
    };
  }

  return {
    valid: field?.value ?? false,
    reason: field?.text ?? fallbackReason ?? null,
  };
}

class AbstractEmailFeed extends BaseFeed {
  name = 'AbstractEmail';
  supportedTypes: IoCType[] = ['email'];

  async query(ioc: string, type: IoCType): Promise<FeedResult> {
    const start = Date.now();

    if (type !== 'email') {
      return { status: 'failed', feedName: this.name, error: `Unsupported IoC type: ${type}`, latencyMs: Date.now() - start };
    }
    if (!ABSTRACT_EMAIL_API_KEY) {
      return { status: 'disabled', feedName: 'AbstractEmail', error: 'API key not configured', latencyMs: 0 };
    }

    try {
      const response = await axios.get(
        `https://emailreputation.abstractapi.com/v1/?api_key=${ABSTRACT_EMAIL_API_KEY}&email=${ioc}`,
        { timeout: 8000 }
      );

      const data = response.data as Record<string, unknown>;
      if (!data) {
        return { status: 'failed', feedName: this.name, error: 'Unexpected response format', latencyMs: Date.now() - start };
      }

      // eslint-disable-next-line no-console -- requested: log raw payload before parsing for debugging
      console.log('[AbstractEmail] raw response.data', response.data);

      const emailQuality = isRecord(data.email_quality) ? data.email_quality : undefined;
      const emailDeliverability = isRecord(data.email_deliverability) ? data.email_deliverability : undefined;

      const isDisposable =
        parseBoolField(data.is_disposable_email as ApiBoolField) ??
        parseBoolField(emailQuality?.is_disposable as ApiBoolField);

      let isFreeEmail =
        parseBoolField(data.is_free_email as ApiBoolField) ??
        parseBoolField(emailQuality?.is_free_email as ApiBoolField);

      const isRoleEmail =
        parseBoolField(data.is_role_email as ApiBoolField) ??
        parseBoolField(emailQuality?.is_role as ApiBoolField);

      const isCatchall =
        parseBoolField(data.is_catchall_email as ApiBoolField) ??
        parseBoolField(emailQuality?.is_catchall as ApiBoolField);

      const isMxFound =
        parseBoolField(data.is_mx_found as ApiBoolField) ??
        parseBoolField(emailDeliverability?.is_mx_valid as ApiBoolField);

      const isSmtpValid =
        parseBoolField(data.is_smtp_valid as ApiBoolField) ??
        parseBoolField(emailDeliverability?.is_smtp_valid as ApiBoolField);

      // Reputation payloads can mark disposable inboxes as non-free; normalize to avoid under-scoring obvious throwaways.
      if (isDisposable === true && isFreeEmail !== true) {
        isFreeEmail = true;
      }

      const isValidFormat =
        parseBoolField(data.is_valid_format as ApiBoolField) ??
        parseBoolField(emailDeliverability?.is_format_valid as ApiBoolField);

      const qualityScore =
        parseNumberField(data.quality_score) ??
        parseNumberField(data.score) ??
        parseNumberField(emailQuality?.score);

      const smtpReason =
        typeof emailDeliverability?.status_detail === 'string'
          ? emailDeliverability.status_detail
          : null;

      const tags: string[] = [];
      if (isDisposable === true) tags.push('disposable');
      if (isFreeEmail === true) tags.push('free-email');
      if (isRoleEmail === true) tags.push('role-account');
      if (isCatchall === true) tags.push('catchall');
      if (isMxFound === false) tags.push('no-mx-record');
      if (isSmtpValid === false) tags.push('smtp-invalid');

      let confidenceScore = 0;
      if (isDisposable === true) confidenceScore += 50;
      if (isSmtpValid === false) confidenceScore += 30;
      if (isMxFound === false) confidenceScore += 40;
      if (isFreeEmail === true) confidenceScore += 5;
      confidenceScore = Math.min(confidenceScore, 100);

      // Autocorrect suggestion from the API
      const autocorrect = data.autocorrect as string | undefined;

      return {
        status:          'success',
        feedName:        this.name,
        latencyMs:       Date.now() - start,
        confidenceScore,
        tags,
        detections:      tags.length,
        data: {
          qualityScore,
          isValidFormat,
          isFreeEmail,
          isDisposable,
          isMxFound,
          isSmtpValid,
          smtpDetail:     parseSmtpDetail(
            (data.is_smtp_valid as ApiBoolField) ?? (emailDeliverability?.is_smtp_valid as ApiBoolField),
            smtpReason
          ),
          autocorrect:    autocorrect && autocorrect !== ioc ? autocorrect : undefined,
        },
        rawData: data,
      };
    } catch (error: unknown) {
      return {
        status:    'failed',
        feedName:  this.name,
        error:     error instanceof Error ? error.message : 'unknown',
        latencyMs: Date.now() - start,
      };
    }
  }
}

export const abstractEmailFeed = new AbstractEmailFeed();
