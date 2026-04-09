/**
 * Admin-only cache management endpoints.
 * All routes require a valid JWT with tier === 'enterprise'.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { verifyAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { fireAudit } from '../services/auditService';
import {
  invalidateCache,
  invalidateCacheByIoC,
  flushCache,
} from '../services/cache';
import { getAllFeedHealth } from '../services/feedHealthService';
import { getMetrics } from '../services/metricsService';
import { AuthError } from '../errors';
import { IoCType, UserPayload } from '../types';

const router = Router();

// ── Enterprise-only guard ─────────────────────────────────────────────────────

function requireEnterprise(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user as UserPayload | undefined;
  if (!user || user.tier !== 'enterprise') {
    throw new AuthError('This endpoint requires an enterprise-tier account');
  }
  next();
}

// ── Request schema ─────────────────────────────────────────────────────────────

const invalidateSchema = z.discriminatedUnion('type', [
  z.object({
    type:    z.literal('single'),
    ioc:     z.string().min(1).max(2048),
    iocType: z.enum(['ip', 'domain', 'hash', 'email']),
  }),
  z.object({
    type: z.literal('ioc'),
    ioc:  z.string().min(1).max(2048),
  }),
  z.object({
    type: z.literal('flush'),
  }),
]);

// ── POST /api/v1/admin/cache/invalidate ───────────────────────────────────────

router.post(
  '/cache/invalidate',
  verifyAuth,
  requireEnterprise,
  validate(invalidateSchema),
  async (req: Request, res: Response) => {
    const user   = req.user as UserPayload;
    const body   = req.body as z.infer<typeof invalidateSchema>;
    const ip     = req.ip ?? 'unknown';
    const ua     = (req.headers['user-agent'] ?? '').slice(0, 200);
    const rid    = req.requestId ?? 'unknown';

    let deleted = 0;
    let action: string;

    switch (body.type) {
      case 'single': {
        await invalidateCache(body.ioc, body.iocType as IoCType);
        deleted = 1;
        action  = 'cache_invalidate_single';
        break;
      }
      case 'ioc': {
        deleted = await invalidateCacheByIoC(body.ioc);
        action  = 'cache_invalidate_by_ioc';
        break;
      }
      case 'flush': {
        deleted = await flushCache();
        action  = 'cache_flush';
        break;
      }
    }

    fireAudit({
      userId:    user.id,
      action,
      resource:  'cache',
      details:   { type: body.type, deleted },
      ipAddress: ip,
      userAgent: ua,
      requestId: rid,
      outcome:   'success',
    });

    res.json({ ok: true, type: body.type, deleted });
  }
);

// ── GET /api/v1/admin/metrics ─────────────────────────────────────────────────

router.get('/metrics', verifyAuth, requireEnterprise, async (_req, res, next) => {
  try {
    const [base, feedHealth] = await Promise.all([
      getMetrics(),
      getAllFeedHealth(),
    ]);

    // Map feed health metrics to the metrics response shape
    const feeds = Object.fromEntries(
      Object.entries(feedHealth).map(([name, h]) => [
        name,
        {
          calls:        h.requestsLastHour,
          successes:    h.successCount,
          failures:     h.failureCount,
          timeouts:     h.timeoutCount,
          avgLatencyMs: h.avgLatencyMs,
          p95LatencyMs: h.p95LatencyMs,
          successRate:  h.successRate,
          state:        h.state,
        },
      ])
    );

    res.json({ ...base, feeds });
  } catch (err) {
    next(err);
  }
});

export default router;
