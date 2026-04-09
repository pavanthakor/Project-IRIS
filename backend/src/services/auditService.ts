/**
 * Centralised, fire-and-forget audit trail writer.
 *
 * All writes are non-blocking: the caller never awaits `fireAudit`.  Any DB
 * error is caught internally and emitted as a logger.error — the request path
 * is never interrupted.
 *
 * Sensitive fields in `details` are stripped before persisting.
 */

import { dbQuery } from '../config/database';
import logger from '../utils/logger';

// ── Sensitive key scrubbing ───────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'key', 'hash',
  'credential', 'authorization', 'cookie', 'apikey',
]);

function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(details)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[REDACTED]' : v;
  }
  return out;
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface AuditEntry {
  userId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress: string;
  userAgent?: string;
  requestId: string;
  outcome: 'success' | 'failure' | 'denied';
}

/**
 * Persist one audit entry.  Throws on DB error — use `fireAudit` if you want
 * fire-and-forget semantics.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  const sanitized = entry.details ? sanitizeDetails(entry.details) : {};

  await dbQuery(
    `INSERT INTO audit_log
       (user_id, action, resource, resource_id, details,
        ip_address, user_agent, request_id, outcome)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.userId   ?? null,
      entry.action,
      entry.resource ?? null,
      entry.resourceId ?? null,
      JSON.stringify(sanitized),
      entry.ipAddress,
      entry.userAgent ? entry.userAgent.slice(0, 500) : null,
      entry.requestId,
      entry.outcome,
    ]
  );
}

/**
 * Fire-and-forget wrapper — never throws, never blocks the request path.
 * Call this from middleware and route handlers.
 */
export function fireAudit(entry: AuditEntry): void {
  logAudit(entry).catch((err: unknown) => {
    logger.error('audit_log_write_failed', {
      action: entry.action,
      requestId: entry.requestId,
      error: err instanceof Error ? err.message : 'unknown',
    });
  });
}
