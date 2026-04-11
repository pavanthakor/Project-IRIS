import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { validate } from '../middleware/validate';
import { orchestrateQuery } from '../services/orchestrator';
import { correlate } from '../services/correlationEngine';
import { mapToMitre } from '../services/mitreMapper';
import { getCachedResult, setCachedResult } from '../services/cache';
import { dbQuery, withTransaction } from '../config/database';
import { fireAudit } from '../services/auditService';
import { NotFoundError, ValidationError } from '../errors';
import { IoCType, ThreatProfile, UserPayload, PaginatedHistory } from '../types';
import logger from '../utils/logger';
import { maskIoC } from '../services/orchestrator';
import { dispatchWebhooks } from '../services/webhookService';
import { systemState } from '../services/systemState';
import {
  sanitizeString,
  validateIP,
  validateDomain,
  validateHash,
  validateEmail,
} from '../utils/validators';

const router = Router();

/**
 * Query schema with production-grade validation.
 *
 * Pipeline:
 *   1. Coerce raw string fields (trim, length limits, null-byte rejection).
 *   2. superRefine — type-specific validation with specific error messages.
 *   3. transform — normalize the ioc (lowercase domain/email) and attach
 *      derived metadata (hashType, typoSuggestion).
 */
const querySchema = z
  .object({
    ioc: z
      .string()
      .trim()
      .min(1, 'IOC value cannot be empty')
      .max(2048, 'IOC value too long (max 2048 chars)')
      .refine((s) => !s.includes('\x00'), {
        message: 'IOC value contains null bytes',
      }),
    type: z.enum(['ip', 'domain', 'hash', 'email']),
  })
  .superRefine((data, ctx) => {
    // Sanitize first so validation runs on the clean value
    let ioc: string;
    try {
      ioc = sanitizeString(data.ioc);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ioc'],
        message: 'IOC value contains invalid characters',
      });
      return;
    }

    if (ioc.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ioc'],
        message: 'IOC value is empty after sanitization',
      });
      return;
    }

    let result: { valid: boolean; error?: string };

    switch (data.type) {
      case 'ip':
        result = validateIP(ioc);
        break;
      case 'domain':
        result = validateDomain(ioc);
        break;
      case 'hash':
        result = validateHash(ioc);
        break;
      case 'email':
        result = validateEmail(ioc);
        break;
      default:
        return; // zod already caught unknown enum values
    }

    if (!result.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ioc'],
        message: result.error ?? 'Invalid IOC value',
      });
    }
  })
  .transform((data) => {
    // sanitizeString is safe here — superRefine already passed
    const sanitized = sanitizeString(data.ioc);

    let ioc = sanitized;
    let hashType: 'md5' | 'sha1' | 'sha256' | undefined;
    let typoSuggestion: string | undefined;

    switch (data.type) {
      case 'hash': {
        const h = validateHash(sanitized);
        hashType = h.hashType;
        break;
      }
      case 'email': {
        const e = validateEmail(sanitized);
        ioc = e.normalized ?? sanitized;
        typoSuggestion = e.typoSuggestion;
        break;
      }
      case 'domain': {
        const d = validateDomain(sanitized);
        ioc = d.normalized ?? sanitized;
        break;
      }
      default:
        break;
    }

    return {
      ioc,
      type: data.type as IoCType,
      hashType,
      typoSuggestion,
    };
  });

// Persists the query result to ioc_queries.  Audit logging is handled
// separately via fireAudit so it never blocks persistence and vice-versa.
const persistQuery = async (userId: string, profile: ThreatProfile) => {
  try {
    await withTransaction(async (client) => {
      const queryInsertResult = await client.query(
        `INSERT INTO ioc_queries (id, user_id, ioc_value, ioc_type, risk_score, result_json)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          profile.queryId,
          userId,
          profile.ioc,
          profile.type,
          profile.riskScore,
          JSON.stringify(profile),
        ]
      );

      if (queryInsertResult.rowCount === 0) {
        throw new Error('Failed to insert query into history');
      }
    });
    logger.info('persist_success', { queryId: profile.queryId, userId });
  } catch (error) {
    logger.error('persist_failure', {
      queryId: profile.queryId,
      userId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
};

// ── systemStatus helper ───────────────────────────────────────────────────────

function buildSystemStatus() {
  const overall     = systemState.getOverallStatus();
  const limitations = systemState.getDegradedCapabilities();
  if (overall === 'healthy' && limitations.length === 0) return undefined;
  return { overall, limitations } as const;
}

router.post(
  '/',
  validate(querySchema),
  async (req: Request, res: Response) => {
    // Shed load when memory is critical
    if (systemState.isMemoryCritical()) {
      res.status(503).json({
        error: {
          code:      'SERVICE_OVERLOADED',
          message:   'Service is temporarily overloaded. Please retry in a moment.',
          requestId: req.requestId ?? 'unknown',
        },
      });
      return;
    }

    const { ioc, type, hashType, typoSuggestion } = req.body as z.infer<typeof querySchema>;
    const user         = req.user as UserPayload;
    const queryId      = uuidv4();
    const ip           = req.ip ?? 'unknown';
    const ua           = (req.headers['user-agent'] ?? '').slice(0, 200);
    const rid          = req.requestId ?? 'unknown';
    const forceRefresh = req.query['force'] === 'true';

    // Build a background-refresh function that re-runs the full pipeline and
    // re-populates the cache entry without blocking this response.
    const buildRefreshFn = () => async (): Promise<unknown> => {
      const { feeds: freshFeeds, durationMs: freshDuration } = await orchestrateQuery(ioc, type);
      const freshCorr = correlate(freshFeeds);
      const freshMitre = await mapToMitre(freshFeeds);
      const freshProfile: ThreatProfile = {
        queryId: uuidv4(),
        ioc,
        type,
        riskScore:       freshCorr.riskScore,
        riskLevel:       freshCorr.riskLevel,
        verdict:         freshCorr.verdict,
        feeds:           freshFeeds,
        mitreTechniques: freshMitre,
        geoLocation:     freshCorr.geoLocation,
        cachedAt:        null,
        queryDurationMs: freshDuration,
        hashType,
        typoSuggestion,
      };
      await setCachedResult(ioc, type, freshProfile);
      logger.info('cache_bg_refresh_complete', {
        ioc: maskIoC(ioc), type, riskLevel: freshCorr.riskLevel,
      });
      return freshProfile;
    };

    // Cache read — skipped when ?force=true
    if (!forceRefresh) {
      const cachedProfile = await getCachedResult(ioc, type, buildRefreshFn());
      if (cachedProfile) {
        const response: ThreatProfile = {
          ...cachedProfile,
          queryId,
          hashType:       hashType       ?? cachedProfile.hashType,
          typoSuggestion: typoSuggestion ?? cachedProfile.typoSuggestion,
          systemStatus:   buildSystemStatus(),
        };
        res.json(response);

        persistQuery(user.id, response);
        dispatchWebhooks(user.id, response);
        fireAudit({
          userId:     user.id,
          action:     'query_cache_hit',
          resource:   'ioc',
          resourceId: ioc,
          details:    { queryId, type, forced: false },
          ipAddress:  ip,
          userAgent:  ua,
          requestId:  rid,
          outcome:    'success',
        });

        logger.info('feed_performance', {
          requestId: rid, feeds: [], totalDurationMs: 0, cacheHit: true,
        });
        return;
      }
    }

    // Live query
    const { feeds, disabledFeeds, durationMs } = await orchestrateQuery(ioc, type);
    const correlationResult = correlate(feeds);
    const mitreTechniques   = await mapToMitre(feeds);

    const threatProfile: ThreatProfile = {
      queryId,
      ioc,
      type,
      riskScore:       correlationResult.riskScore,
      riskLevel:       correlationResult.riskLevel,
      verdict:         correlationResult.verdict,
      feeds,
      mitreTechniques,
      geoLocation:     correlationResult.geoLocation,
      cachedAt:        null,
      queryDurationMs: durationMs,
      hashType,
      typoSuggestion,
      systemStatus:    buildSystemStatus(),
    };

    res.json(threatProfile);

    void persistQuery(user.id, threatProfile);
    dispatchWebhooks(user.id, threatProfile);
    // Always write to cache (even on force=true, so next request can use it)
    void setCachedResult(ioc, type, threatProfile);

    // Audit
    const successFeeds = feeds.filter(f => f.status === 'success').length;
    fireAudit({
      userId:     user.id,
      action:     'ioc_query',
      resource:   'ioc',
      resourceId: ioc,
      details: {
        queryId,
        type,
        forced:         forceRefresh,
        feedsQueried:   feeds.length,
        feedsSucceeded: successFeeds,
        riskScore:      threatProfile.riskScore,
      },
      ipAddress: ip,
      userAgent: ua,
      requestId: rid,
      outcome:   successFeeds > 0 ? 'success' : 'failure',
    });

    logger.info('feed_performance', {
      requestId: rid,
      feeds: [
        ...feeds.map(f => ({ name: f.feedName, status: f.status, latencyMs: f.latencyMs })),
        ...disabledFeeds.map(f => ({ name: f.name, status: f.status, latencyMs: 0 })),
      ],
      totalDurationMs: durationMs,
      cacheHit: false,
      forced: forceRefresh,
    });
  }
);

router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as UserPayload;
    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = parseInt(req.query.pageSize as string, 10) || 10;

    if (page < 1 || pageSize < 1 || pageSize > 100) {
      throw new ValidationError('Invalid pagination parameters');
    }

    const offset = (page - 1) * pageSize;

    const [historyResult, totalResult] = await Promise.all([
      dbQuery(
        `SELECT id, ioc_value, ioc_type, risk_score, queried_at
         FROM ioc_queries
         WHERE user_id = $1
         ORDER BY queried_at DESC
         LIMIT $2 OFFSET $3`,
        [user.id, pageSize, offset]
      ),
      dbQuery('SELECT COUNT(*) FROM ioc_queries WHERE user_id = $1', [user.id]),
    ]);

    const totalRow = totalResult.rows[0] as { count?: unknown } | undefined;
    const total = totalRow?.count ? parseInt(String(totalRow.count), 10) : 0;

    const response: PaginatedHistory = {
      items: historyResult.rows.map(row => ({
        id: row.id,
        iocValue: row.ioc_value,
        iocType: row.ioc_type,
        riskScore: row.risk_score,
        queriedAt: new Date(row.queried_at).toISOString(),
      })),
      total,
      page,
      pageSize,
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const user = req.user as UserPayload;

    const result = await dbQuery(
      'SELECT result_json FROM ioc_queries WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError(`Query with ID ${id} not found`);
    }

    const row = result.rows[0] as { result_json?: unknown } | undefined;
    if (!row) {
      throw new NotFoundError(`Query with ID ${id} not found`);
    }

    const raw = row.result_json;
    const profile =
      typeof raw === 'string'
        ? (JSON.parse(raw) as ThreatProfile)
        : (raw as ThreatProfile);

    res.json(profile);
  } catch (err) {
    next(err);
  }
});

export const queryRoutes = router;