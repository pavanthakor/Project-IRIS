import axios from 'axios';
import { BaseFeed } from './baseFeed';
import { FeedResult, IoCType } from '../types';
import { ABSTRACT_EMAIL_API_KEY } from '../config';

interface SmtpDetail {
  readonly valid: boolean;
  readonly reason: string | null;
}

function parseSmtpDetail(field: { value?: boolean; text?: string } | undefined): SmtpDetail {
  return {
    valid:  field?.value  ?? false,
    reason: field?.text   ?? null,
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

      type BoolField = { value?: boolean } | undefined;
      const isDisposable  = (data.is_disposable_email as BoolField)?.value;
      const isFreeEmail   = (data.is_free_email       as BoolField)?.value;
      const isRoleEmail   = (data.is_role_email        as BoolField)?.value;
      const isCatchall    = (data.is_catchall_email    as BoolField)?.value;
      const isMxFound     = (data.is_mx_found          as BoolField)?.value;
      const isSmtpValid   = (data.is_smtp_valid        as BoolField)?.value;

      const tags: string[] = [];
      if (isDisposable)     tags.push('disposable');
      if (isFreeEmail)      tags.push('free-email');
      if (isRoleEmail)      tags.push('role-account');
      if (isCatchall)       tags.push('catchall');
      if (isMxFound === false) tags.push('no-mx-record');
      if (isSmtpValid === false) tags.push('smtp-invalid');

      let confidenceScore = 0;
      if (isDisposable)          confidenceScore += 50;
      if (isSmtpValid === false)  confidenceScore += 30;
      if (isMxFound === false)    confidenceScore += 40;
      if (isCatchall)             confidenceScore += 10;
      if (isFreeEmail)            confidenceScore += 5;
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
          qualityScore:   data.score        as number | undefined,
          isValidFormat:  (data.is_valid_format as BoolField)?.value,
          isFreeEmail,
          isDisposable,
          isMxFound,
          isSmtpValid,
          smtpDetail:     parseSmtpDetail(data.is_smtp_valid as { value?: boolean; text?: string } | undefined),
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
