/**
 * Webhook dispatch service.
 *
 * dispatchWebhooks() is designed to be called fire-and-forget after every
 * query completes.  It never throws and never blocks the request path.
 *
 * Delivery pipeline per matching webhook:
 *   1. Build payload (sanitized ThreatProfile + event metadata).
 *   2. Sign with HMAC-SHA256 using the webhook's per-row secret.
 *   3. POST to webhook URL with a 5-second timeout.
 *   4. On failure: retry up to 3 times with exponential backoff (1 s, 4 s, 16 s).
 *   5. After all retries fail: increment failure_count; disable webhook if ≥ 10.
 *   6. Audit log every delivery attempt (webhook_delivered / webhook_failed).
 */

import { createHmac, randomBytes } from 'node:crypto';
import axios, { AxiosError } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { dbQuery } from '../config/database';
import { fireAudit } from './auditService';
import { ThreatProfile } from '../types';
import logger from '../utils/logger';

// ── Constants ─────────────────────────────────────────────────────────────────

const DELIVERY_TIMEOUT_MS = 5_000;
const MAX_RETRIES         = 3;       // 3 retries after the initial attempt → 4 total
const BACKOFF_BASE_MS     = 1_000;   // 1 s → 4 s → 16 s (base^(4^attempt))

// ── Types ─────────────────────────────────────────────────────────────────────

interface WebhookRow {
  id:            string;
  user_id:       string;
  url:           string;
  secret:        string;
  events:        string[];
  min_risk_score: number;
  failure_count: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate a cryptographically random 32-byte hex secret for HMAC signing. */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex');
}

/** Sign a JSON body with HMAC-SHA256 and return `sha256=<hex>`. */
function sign(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/** Sanitize a ThreatProfile for inclusion in the webhook payload.
 *  Strips rawData and any fields not useful to the receiver. */
function sanitizeProfile(profile: ThreatProfile): Record<string, unknown> {
  return {
    queryId:         profile.queryId,
    ioc:             profile.ioc,
    type:            profile.type,
    riskScore:       profile.riskScore,
    riskLevel:       profile.riskLevel,
    verdict:         profile.verdict,
    queryDurationMs: profile.queryDurationMs,
    geoLocation:     profile.geoLocation,
    mitreTechniques: profile.mitreTechniques,
    feeds: profile.feeds.map(f => ({
      feedName:        f.feedName,
      status:          f.status,
      confidenceScore: f.confidenceScore,
      detections:      f.detections,
      totalEngines:    f.totalEngines,
      latencyMs:       f.latencyMs,
      error:           f.error,
    })),
  };
}

// ── Delivery ──────────────────────────────────────────────────────────────────

/**
 * Attempt delivery of a single webhook payload with exponential-backoff retries.
 * All failure paths are caught internally and written to the audit log.
 */
async function deliverWithRetry(
  webhook:    WebhookRow,
  payload:    Record<string, unknown>,
  deliveryId: string,
  attempt     = 0
): Promise<void> {
  const body      = JSON.stringify(payload);
  const signature = sign(webhook.secret, body);
  const event     = String(payload['event'] ?? 'high_risk_detected');

  try {
    await axios.post(webhook.url, body, {
      timeout: DELIVERY_TIMEOUT_MS,
      headers: {
        'Content-Type':         'application/json',
        'X-Webhook-Signature':  signature,
        'X-Webhook-Event':      event,
        'X-Webhook-ID':         deliveryId,
        'User-Agent':           'ThreatIntel-Webhooks/1.0',
      },
      // Treat any 2xx as success; let non-2xx throw so retry logic kicks in
      validateStatus: (s) => s >= 200 && s < 300,
    });

    // ── Success path ─────────────────────────────────────────────────────────
    logger.info('webhook_delivered', {
      webhookId: webhook.id, deliveryId, attempt, url: webhook.url,
    });

    dbQuery(
      'UPDATE webhooks SET last_triggered_at = NOW(), failure_count = 0 WHERE id = $1',
      [webhook.id]
    ).catch((err: unknown) => {
      logger.warn('webhook_update_last_triggered_failed', {
        webhookId: webhook.id,
        error: err instanceof Error ? err.message : 'unknown',
      });
    });

    fireAudit({
      userId:     webhook.user_id,
      action:     'webhook_delivered',
      resource:   'webhook',
      resourceId: webhook.id,
      details:    { deliveryId, event, attempt, url: webhook.url },
      ipAddress:  'system',
      requestId:  deliveryId,
      outcome:    'success',
    });

  } catch (err) {
    const errMsg = err instanceof AxiosError
      ? (err.response ? `HTTP ${err.response.status}` : err.message)
      : (err instanceof Error ? err.message : 'unknown');

    logger.warn('webhook_delivery_attempt_failed', {
      webhookId: webhook.id, deliveryId, attempt, url: webhook.url, error: errMsg,
    });

    // ── Retry if attempts remain ──────────────────────────────────────────────
    if (attempt < MAX_RETRIES) {
      const backoffMs = BACKOFF_BASE_MS * Math.pow(4, attempt); // 1 s, 4 s, 16 s
      await new Promise<void>(r => setTimeout(r, backoffMs));
      return deliverWithRetry(webhook, payload, deliveryId, attempt + 1);
    }

    // ── All retries exhausted ─────────────────────────────────────────────────
    const newFailureCount = webhook.failure_count + 1;
    const deactivate      = newFailureCount >= 10;

    dbQuery(
      `UPDATE webhooks SET failure_count = $1${deactivate ? ', is_active = false' : ''} WHERE id = $2`,
      [newFailureCount, webhook.id]
    ).catch((dbErr: unknown) => {
      logger.warn('webhook_update_failure_count_failed', {
        webhookId: webhook.id,
        error: dbErr instanceof Error ? dbErr.message : 'unknown',
      });
    });

    if (deactivate) {
      logger.error('webhook_deactivated', {
        webhookId: webhook.id, url: webhook.url, failureCount: newFailureCount,
      });
    }

    fireAudit({
      userId:     webhook.user_id,
      action:     'webhook_failed',
      resource:   'webhook',
      resourceId: webhook.id,
      details: {
        deliveryId,
        event,
        totalAttempts: attempt + 1,
        error:         errMsg,
        deactivated:   deactivate,
      },
      ipAddress: 'system',
      requestId: deliveryId,
      outcome:   'failure',
    });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget: dispatch webhooks for every active webhook owned by
 * `userId` whose minRiskScore ≤ profile.riskScore.
 *
 * Safe to call without awaiting — all errors are logged internally.
 */
export function dispatchWebhooks(userId: string, profile: ThreatProfile): void {
  void (async () => {
    let webhooks: WebhookRow[];
    try {
      const result = await dbQuery(
        `SELECT id, user_id, url, secret, events, min_risk_score, failure_count
         FROM webhooks
         WHERE user_id = $1
           AND is_active = true
           AND min_risk_score <= $2
           AND 'high_risk_detected' = ANY(events)`,
        [userId, profile.riskScore]
      );
      webhooks = result.rows as WebhookRow[];
    } catch (err) {
      logger.error('webhook_fetch_failed', {
        userId,
        error: err instanceof Error ? err.message : 'unknown',
      });
      return;
    }

    if (webhooks.length === 0) return;

    const sanitized = sanitizeProfile(profile);

    for (const webhook of webhooks) {
      const deliveryId = uuidv4();
      const payload    = {
        event:      'high_risk_detected',
        timestamp:  new Date().toISOString(),
        deliveryId,
        profile:    sanitized,
      };

      // Each delivery is independent — one failure must not block others
      void deliverWithRetry(webhook, payload, deliveryId);
    }
  })();
}

/**
 * Deliver a test payload to a single webhook URL.
 * Returns the HTTP status code and whether delivery succeeded.
 * Used by POST /api/v1/webhooks/:id/test.
 */
export async function deliverTestPayload(
  webhook:    { id: string; url: string; secret: string },
  deliveryId: string
): Promise<{ delivered: boolean; statusCode: number | null; error?: string }> {
  const payload = {
    event:      'high_risk_detected',
    timestamp:  new Date().toISOString(),
    deliveryId,
    test:       true,
    profile: {
      queryId:         deliveryId,
      ioc:             '192.0.2.1',
      type:            'ip',
      riskScore:       95,
      riskLevel:       'CRITICAL',
      verdict:         'Malicious',
      queryDurationMs: 0,
      feeds:           [],
      mitreTechniques: [],
    },
  };

  const body      = JSON.stringify(payload);
  const signature = sign(webhook.secret, body);

  try {
    const resp = await axios.post(webhook.url, body, {
      timeout: DELIVERY_TIMEOUT_MS,
      headers: {
        'Content-Type':        'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event':     'high_risk_detected',
        'X-Webhook-ID':        deliveryId,
        'User-Agent':          'ThreatIntel-Webhooks/1.0',
      },
      validateStatus: () => true, // capture all status codes, never throw on HTTP error
    });

    const delivered = resp.status >= 200 && resp.status < 300;
    logger.info('webhook_test_delivery', {
      webhookId: webhook.id, deliveryId, url: webhook.url,
      statusCode: resp.status, delivered,
    });
    return { delivered, statusCode: resp.status };

  } catch (err) {
    const errMsg = err instanceof AxiosError ? err.message : (err instanceof Error ? err.message : 'unknown');
    logger.warn('webhook_test_delivery_failed', {
      webhookId: webhook.id, deliveryId, url: webhook.url, error: errMsg,
    });
    return { delivered: false, statusCode: null, error: errMsg };
  }
}
