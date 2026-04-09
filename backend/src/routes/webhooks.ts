/**
 * Webhook management endpoints.
 *
 * POST   /api/v1/webhooks          — register a new webhook
 * GET    /api/v1/webhooks          — list all webhooks for the authed user
 * DELETE /api/v1/webhooks/:id      — remove a webhook
 * POST   /api/v1/webhooks/:id/test — fire a test payload to the webhook URL
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { validate } from '../middleware/validate';
import { dbQuery } from '../config/database';
import { fireAudit } from '../services/auditService';
import { generateWebhookSecret, deliverTestPayload } from '../services/webhookService';
import { NotFoundError } from '../errors';
import { UserPayload } from '../types';

const router = Router();

// ── Schema ────────────────────────────────────────────────────────────────────

const createWebhookSchema = z.object({
  url: z
    .string()
    .url('Must be a valid URL')
    .refine(u => u.startsWith('https://'), { message: 'Webhook URL must use HTTPS' }),
  events: z
    .array(z.enum(['high_risk_detected']))
    .min(1, 'At least one event is required')
    .default(['high_risk_detected']),
  minRiskScore: z.number().int().min(0).max(100).default(70),
});

// ── POST /api/v1/webhooks ─────────────────────────────────────────────────────

router.post(
  '/',
  validate(createWebhookSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user   = req.user as UserPayload;
      const body   = req.body as z.infer<typeof createWebhookSchema>;
      const secret = generateWebhookSecret();
      const ip     = req.ip ?? 'unknown';
      const ua     = (req.headers['user-agent'] ?? '').slice(0, 200);
      const rid    = req.requestId ?? 'unknown';

      const result = await dbQuery(
        `INSERT INTO webhooks (user_id, url, secret, events, min_risk_score)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, url, events, min_risk_score, created_at`,
        [user.id, body.url, secret, body.events, body.minRiskScore]
      );

      const row = result.rows[0] as {
        id: string; url: string; events: string[];
        min_risk_score: number; created_at: string;
      };

      fireAudit({
        userId:     user.id,
        action:     'webhook_created',
        resource:   'webhook',
        resourceId: row.id,
        details:    { url: body.url, events: body.events, minRiskScore: body.minRiskScore },
        ipAddress:  ip,
        userAgent:  ua,
        requestId:  rid,
        outcome:    'success',
      });

      // Secret is returned only once — it cannot be retrieved again
      res.status(201).json({
        id:           row.id,
        url:          row.url,
        secret,
        events:       row.events,
        minRiskScore: row.min_risk_score,
        createdAt:    row.created_at,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /api/v1/webhooks ──────────────────────────────────────────────────────

router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user as UserPayload;

      const result = await dbQuery(
        `SELECT id, url, events, min_risk_score, is_active,
                created_at, last_triggered_at, failure_count
         FROM webhooks
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [user.id]
      );

      res.json({
        webhooks: result.rows.map(r => ({
          id:              r.id,
          url:             r.url,
          events:          r.events,
          minRiskScore:    r.min_risk_score,
          isActive:        r.is_active,
          createdAt:       r.created_at,
          lastTriggeredAt: r.last_triggered_at,
          failureCount:    r.failure_count,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /api/v1/webhooks/:id ───────────────────────────────────────────────

router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user as UserPayload;
      const { id } = req.params;
      const ip   = req.ip ?? 'unknown';
      const ua   = (req.headers['user-agent'] ?? '').slice(0, 200);
      const rid  = req.requestId ?? 'unknown';

      const result = await dbQuery(
        'DELETE FROM webhooks WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, user.id]
      );

      if (result.rowCount === 0) {
        throw new NotFoundError(`Webhook ${id} not found`);
      }

      fireAudit({
        userId:     user.id,
        action:     'webhook_deleted',
        resource:   'webhook',
        resourceId: id,
        details:    {},
        ipAddress:  ip,
        userAgent:  ua,
        requestId:  rid,
        outcome:    'success',
      });

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/v1/webhooks/:id/test ────────────────────────────────────────────

router.post(
  '/:id/test',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user as UserPayload;
      const { id } = req.params;
      const ip   = req.ip ?? 'unknown';
      const ua   = (req.headers['user-agent'] ?? '').slice(0, 200);
      const rid  = req.requestId ?? 'unknown';

      const result = await dbQuery(
        'SELECT id, url, secret FROM webhooks WHERE id = $1 AND user_id = $2',
        [id, user.id]
      );

      if (!result.rows[0]) {
        throw new NotFoundError(`Webhook ${id} not found`);
      }

      const webhook = result.rows[0] as { id: string; url: string; secret: string };
      const deliveryId = uuidv4();

      const delivery = await deliverTestPayload(webhook, deliveryId);

      fireAudit({
        userId:     user.id,
        action:     'webhook_test',
        resource:   'webhook',
        resourceId: id,
        details:    { deliveryId, url: webhook.url, delivered: delivery.delivered, statusCode: delivery.statusCode },
        ipAddress:  ip,
        userAgent:  ua,
        requestId:  rid,
        outcome:    delivery.delivered ? 'success' : 'failure',
      });

      res.json({
        deliveryId,
        webhookId:  id,
        url:        webhook.url,
        delivered:  delivery.delivered,
        statusCode: delivery.statusCode,
        ...(delivery.error ? { error: delivery.error } : {}),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
