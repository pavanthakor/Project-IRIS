/**
 * POST /api/v1/query/bulk
 *
 * Accepts up to 20 IoCs (tier-limited), validates every entry up-front
 * (fail-fast), then processes them sequentially with a 500 ms inter-query
 * delay to avoid hammering external feed APIs.
 *
 * Tier limits
 *   free       → 400 "Upgrade required"
 *   pro        → max 10 IoCs per request
 *   enterprise → max 20 IoCs per request
 *
 * Redis job tracking
 *   tip:bulk:<jobId>  JSON envelope, TTL 3 600 s
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { redis, withTransaction } from '../config/database';
import { validate } from '../middleware/validate';
import { orchestrateQuery } from '../services/orchestrator';
import { correlate } from '../services/correlationEngine';
import { mapToMitre } from '../services/mitreMapper';
import { getCachedResult, setCachedResult } from '../services/cache';
import { fireAudit } from '../services/auditService';
import { ValidationError } from '../errors';
import { IoCType, ThreatProfile, UserPayload } from '../types';
import logger from '../utils/logger';
import { maskIoC } from '../services/orchestrator';
import {
  sanitizeString,
  validateIP,
  validateDomain,
  validateHash,
  validateEmail,
} from '../utils/validators';

const router = Router();

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_LIMITS: Record<string, number> = {
  free:       0,
  pro:        10,
  enterprise: 20,
};
const INTER_IOC_DELAY_MS = 500;
const JOB_TTL_SECS       = 3_600;

// ── Schema ────────────────────────────────────────────────────────────────────

const bulkItemSchema = z.object({
  ioc:  z.string().trim().min(1, 'IOC cannot be empty').max(2048, 'IOC too long'),
  type: z.enum(['ip', 'domain', 'hash', 'email'] as const),
});

const bulkBodySchema = z.object({
  iocs: z
    .array(bulkItemSchema)
    .min(1, 'At least one IoC is required')
    .max(20, 'Maximum 20 IoCs per bulk request'),
});

type BulkItem     = z.infer<typeof bulkItemSchema>;
type ValidatedIoC = BulkItem & {
  sanitized:      string;
  hashType?:      'md5' | 'sha1' | 'sha256';
  typoSuggestion?: string;
};

// ── Redis job helpers ─────────────────────────────────────────────────────────

interface BulkJobState {
  jobId:      string;
  total:      number;
  completed:  number;
  status:     'processing' | 'complete' | 'failed';
  results:    ThreatProfile[];
  startedAt:  string;
}

async function writeJobState(jobId: string, state: BulkJobState): Promise<void> {
  try {
    await redis.set(`tip:bulk:${jobId}`, JSON.stringify(state), 'EX', JOB_TTL_SECS);
  } catch { /* non-critical */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/** Persist a single query result to ioc_queries (fire-and-forget). */
function persistBulkQueryResult(userId: string, profile: ThreatProfile): void {
  withTransaction(async client => {
    await client.query(
      `INSERT INTO ioc_queries (id, user_id, ioc_value, ioc_type, risk_score, result_json)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [profile.queryId, userId, profile.ioc, profile.type, profile.riskScore, JSON.stringify(profile)]
    );
  }).catch(err => {
    logger.error('bulk_persist_failure', {
      queryId: profile.queryId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  });
}

/**
 * Validate a single IoC against its type using the same rules as the
 * single-query endpoint.  Returns the sanitized + enriched item or throws
 * ValidationError.
 */
function validateSingleIoC(item: BulkItem, index: number): ValidatedIoC {
  let sanitized: string;
  try {
    sanitized = sanitizeString(item.ioc);
  } catch {
    throw new ValidationError(`iocs[${index}].ioc contains invalid characters`, `iocs[${index}].ioc`);
  }

  if (sanitized.length === 0) {
    throw new ValidationError(`iocs[${index}].ioc is empty after sanitization`, `iocs[${index}].ioc`);
  }

  let hashType: 'md5' | 'sha1' | 'sha256' | undefined;
  let typoSuggestion: string | undefined;

  switch (item.type) {
    case 'ip': {
      const r = validateIP(sanitized);
      if (!r.valid) throw new ValidationError(`iocs[${index}].ioc: ${r.error ?? 'Invalid IP'}`, `iocs[${index}].ioc`);
      break;
    }
    case 'domain': {
      const r = validateDomain(sanitized);
      if (!r.valid) throw new ValidationError(`iocs[${index}].ioc: ${r.error ?? 'Invalid domain'}`, `iocs[${index}].ioc`);
      sanitized = r.normalized ?? sanitized;
      break;
    }
    case 'hash': {
      const r = validateHash(sanitized);
      if (!r.valid) throw new ValidationError(`iocs[${index}].ioc: ${r.error ?? 'Invalid hash'}`, `iocs[${index}].ioc`);
      hashType = r.hashType;
      break;
    }
    case 'email': {
      const r = validateEmail(sanitized);
      if (!r.valid) throw new ValidationError(`iocs[${index}].ioc: ${r.error ?? 'Invalid email'}`, `iocs[${index}].ioc`);
      sanitized       = r.normalized ?? sanitized;
      typoSuggestion  = r.typoSuggestion;
      break;
    }
  }

  return { ioc: item.ioc, type: item.type, sanitized, hashType, typoSuggestion };
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post(
  '/',
  validate(bulkBodySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user   = req.user as UserPayload;
    const body   = req.body as z.infer<typeof bulkBodySchema>;
    const ip     = req.ip ?? 'unknown';
    const ua     = (req.headers['user-agent'] ?? '').slice(0, 200);
    const rid    = req.requestId ?? 'unknown';

    // ── Tier gate ─────────────────────────────────────────────────────────────
    const tierMax = TIER_LIMITS[user.tier] ?? 0;
    if (tierMax === 0) {
      res.status(400).json({
        error: {
          code:      'UPGRADE_REQUIRED',
          message:   'Bulk queries require a Pro or Enterprise plan.',
          requestId: rid,
        },
      });
      return;
    }
    if (body.iocs.length > tierMax) {
      res.status(400).json({
        error: {
          code:      'VALIDATION_ERROR',
          message:   `Your ${user.tier} plan allows at most ${tierMax} IoCs per bulk request (got ${body.iocs.length}).`,
          requestId: rid,
        },
      });
      return;
    }

    // ── Fail-fast: validate all IoCs before touching feeds ────────────────────
    let validatedItems: ValidatedIoC[];
    try {
      validatedItems = body.iocs.map((item, i) => validateSingleIoC(item, i));
    } catch (err) {
      return next(err);
    }

    // ── Create Redis job ──────────────────────────────────────────────────────
    const jobId     = uuidv4();
    const startedAt = new Date().toISOString();
    const jobState: BulkJobState = {
      jobId,
      total:     validatedItems.length,
      completed: 0,
      status:    'processing',
      results:   [],
      startedAt,
    };
    await writeJobState(jobId, jobState);

    logger.info('bulk_query_start', {
      jobId,
      total:  validatedItems.length,
      tier:   user.tier,
      userId: user.id,
    });

    // ── Sequential processing ─────────────────────────────────────────────────
    const results: ThreatProfile[] = [];
    const queryStart = Date.now();

    try {
      for (let i = 0; i < validatedItems.length; i++) {
        const item    = validatedItems[i]!;
        const queryId = uuidv4();

        // Delay between IoCs (skip before first)
        if (i > 0) await sleep(INTER_IOC_DELAY_MS);

        // Cache check
        const cached = await getCachedResult(item.sanitized, item.type as IoCType);
        if (cached) {
          const profile: ThreatProfile = {
            ...cached,
            queryId,
            hashType:       item.hashType       ?? cached.hashType,
            typoSuggestion: item.typoSuggestion ?? cached.typoSuggestion,
          };
          results.push(profile);
          persistBulkQueryResult(user.id, profile);
        } else {
          // Live query
          const { feeds, durationMs } = await orchestrateQuery(item.sanitized, item.type as IoCType);
          const corr  = correlate(feeds);
          const mitre = await mapToMitre(feeds);

          const profile: ThreatProfile = {
            queryId,
            ioc:             item.sanitized,
            type:            item.type as IoCType,
            riskScore:       corr.riskScore,
            riskLevel:       corr.riskLevel,
            verdict:         corr.verdict,
            feeds,
            mitreTechniques: mitre,
            geoLocation:     corr.geoLocation,
            cachedAt:        null,
            queryDurationMs: durationMs,
            hashType:        item.hashType,
            typoSuggestion:  item.typoSuggestion,
          };

          results.push(profile);
          persistBulkQueryResult(user.id, profile);
          void setCachedResult(item.sanitized, item.type as IoCType, profile);
        }

        // Update Redis job progress
        jobState.completed = i + 1;
        jobState.results   = results;
        await writeJobState(jobId, jobState);

        logger.info('bulk_ioc_complete', {
          jobId,
          index:     i + 1,
          total:     validatedItems.length,
          ioc:       maskIoC(item.sanitized),
          type:      item.type,
          riskLevel: results[i]?.riskLevel,
        });
      }

      // Mark complete
      jobState.status = 'complete';
      await writeJobState(jobId, jobState);

    } catch (err) {
      jobState.status = 'failed';
      await writeJobState(jobId, jobState);

      logger.error('bulk_query_failed', {
        jobId,
        completed: jobState.completed,
        total:     jobState.total,
        error:     err instanceof Error ? err.message : 'unknown',
      });

      return next(err);
    }

    const durationMs = Date.now() - queryStart;

    fireAudit({
      userId:    user.id,
      action:    'bulk_query',
      resource:  'ioc',
      details:   { jobId, total: validatedItems.length, durationMs },
      ipAddress: ip,
      userAgent: ua,
      requestId: rid,
      outcome:   'success',
    });

    res.status(200).json({
      jobId,
      total:     validatedItems.length,
      completed: results.length,
      results,
      durationMs,
    });
  }
);

export default router;
