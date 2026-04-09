/**
 * Export endpoints.
 *
 * GET /api/v1/export/query/:id
 *   Returns a single query result in the format negotiated by the Accept header:
 *     application/json  → raw JSON  (default)
 *     text/csv          → CSV (one header row + one data row per feed result)
 *     application/pdf   → structured text report (text/plain — no PDF library needed)
 *
 * GET /api/v1/export/history
 *   Streams the caller's query history as CSV.
 *   Query params: format (json|csv), from, to, minRiskScore, maxRiskScore
 *   Max rows: 1 000. Rows are fetched and written in batches to avoid
 *   loading the entire result-set into memory at once.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { dbQuery } from '../config/database';
import { NotFoundError, ValidationError } from '../errors';
import { ThreatProfile, UserPayload } from '../types';
import {
  escapeCsvValue,
  generateCSV,
  setCsvHeaders,
  csvFilename,
} from '../utils/csvExport';

const router = Router();

// ── Shared helpers ────────────────────────────────────────────────────────────

const MAX_HISTORY_ROWS  = 1_000;
const HISTORY_BATCH_SZ  = 100;

function isoOrNull(ts: string | null | undefined): string {
  if (!ts) return '';
  try { return new Date(ts).toISOString(); } catch { return ''; }
}

function safeStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

// ── Single-query export ───────────────────────────────────────────────────────

/**
 * Flatten a ThreatProfile into a header array + one row per feed result.
 * Each row repeats the top-level fields so every row is self-contained.
 */
const SINGLE_QUERY_HEADERS = [
  'query_id', 'timestamp', 'ioc', 'type',
  'risk_score', 'risk_level', 'verdict', 'query_duration_ms',
  'geo_country', 'geo_city', 'geo_org', 'geo_asn',
  'mitre_techniques',
  'feed_name', 'feed_status', 'feed_confidence', 'feed_detections',
  'feed_total_engines', 'feed_latency_ms', 'feed_error',
];

function profileToCsvRows(p: ThreatProfile): string[][] {
  const mitreStr = p.mitreTechniques.map(m => `${m.id} ${m.name}`).join(' | ');
  const baseRow = [
    safeStr(p.queryId),
    isoOrNull(p.cachedAt ?? new Date().toISOString()),
    safeStr(p.ioc),
    safeStr(p.type),
    safeStr(p.riskScore),
    safeStr(p.riskLevel),
    safeStr(p.verdict),
    safeStr(p.queryDurationMs),
    safeStr(p.geoLocation?.country),
    safeStr(p.geoLocation?.city),
    safeStr(p.geoLocation?.org),
    safeStr(p.geoLocation?.asn),
    mitreStr,
  ];

  if (p.feeds.length === 0) {
    return [[...baseRow, '', '', '', '', '', '', '']];
  }

  return p.feeds.map(f => [
    ...baseRow,
    safeStr(f.feedName),
    safeStr(f.status),
    safeStr(f.confidenceScore ?? ''),
    safeStr(f.detections ?? ''),
    safeStr(f.totalEngines ?? ''),
    safeStr(f.latencyMs),
    safeStr(f.error ?? ''),
  ]);
}

/** Render a ThreatProfile as a human-readable structured text report. */
function profileToTextReport(p: ThreatProfile): string {
  const line = (label: string, value: string) =>
    `${label.padEnd(24)}: ${value}`;
  const bar = (char: string, n: number) => char.repeat(n);

  const sections: string[] = [];
  sections.push(bar('=', 60));
  sections.push('  THREAT INTELLIGENCE REPORT');
  sections.push(bar('=', 60));
  sections.push(`  Generated  : ${new Date().toISOString()}`);
  sections.push('');

  sections.push('── SUMMARY ──────────────────────────────────────────────');
  sections.push(line('  IoC',          p.ioc));
  sections.push(line('  Type',         p.type.toUpperCase()));
  sections.push(line('  Risk Score',   `${p.riskScore}/100`));
  sections.push(line('  Risk Level',   p.riskLevel));
  sections.push(line('  Verdict',      p.verdict));
  sections.push(line('  Query ID',     p.queryId));
  sections.push(line('  Duration',     `${p.queryDurationMs} ms`));
  if (p.hashType)       sections.push(line('  Hash Type',    p.hashType.toUpperCase()));
  if (p.typoSuggestion) sections.push(line('  Did you mean', p.typoSuggestion));
  sections.push('');

  if (p.geoLocation) {
    sections.push('── GEOLOCATION ──────────────────────────────────────────');
    if (p.geoLocation.country) sections.push(line('  Country', p.geoLocation.country));
    if (p.geoLocation.city)    sections.push(line('  City',    p.geoLocation.city));
    if (p.geoLocation.org)     sections.push(line('  Org',     p.geoLocation.org));
    if (p.geoLocation.asn)     sections.push(line('  ASN',     p.geoLocation.asn));
    sections.push('');
  }

  sections.push('── FEED RESULTS ─────────────────────────────────────────');
  for (const f of p.feeds) {
    const status = f.status.toUpperCase().padEnd(12);
    let detail = '';
    if (f.confidenceScore !== undefined) detail += ` confidence=${f.confidenceScore}%`;
    if (f.detections !== undefined && f.totalEngines !== undefined) {
      detail += ` detections=${f.detections}/${f.totalEngines}`;
    }
    if (f.error) detail += ` error="${f.error}"`;
    sections.push(`  ${f.feedName.padEnd(16)} ${status} latency=${f.latencyMs}ms${detail}`);
  }
  sections.push('');

  if (p.mitreTechniques.length > 0) {
    sections.push('── MITRE ATT&CK TECHNIQUES ──────────────────────────────');
    for (const m of p.mitreTechniques) {
      sections.push(`  ${m.id.padEnd(14)} ${m.name} [${m.tactic}]`);
      if (m.description) {
        sections.push(`  ${''.padEnd(14)} ${m.description.slice(0, 120)}${m.description.length > 120 ? '…' : ''}`);
      }
    }
    sections.push('');
  }

  sections.push(bar('=', 60));
  sections.push('  END OF REPORT');
  sections.push(bar('=', 60));

  return sections.join('\n');
}

// ── GET /export/query/:id ─────────────────────────────────────────────────────

router.get('/query/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const user   = req.user as UserPayload;

    const result = await dbQuery(
      'SELECT result_json, queried_at FROM ioc_queries WHERE id = $1 AND user_id = $2',
      [id, user.id]
    );

    if (!result.rows[0]) {
      throw new NotFoundError(`Query ${id} not found`);
    }

    const row    = result.rows[0] as { result_json: unknown; queried_at: string };
    const raw    = row.result_json;
    const profile: ThreatProfile =
      typeof raw === 'string' ? (JSON.parse(raw) as ThreatProfile) : (raw as ThreatProfile);

    // ── Content negotiation ───────────────────────────────────────────────────
    const accept = req.headers['accept'] ?? '';

    if (accept.includes('text/csv')) {
      // CSV: one row per feed result (multiple rows share the same header row)
      const rows = profileToCsvRows(profile);
      const csv  = generateCSV(SINGLE_QUERY_HEADERS, rows);
      setCsvHeaders(res, csvFilename(`threat-intel-${profile.ioc.slice(0, 16).replace(/[^a-z0-9]/gi, '-')}`));
      res.send(csv);
      return;
    }

    if (accept.includes('application/pdf')) {
      // Structured text report (no PDF library — returns text/plain)
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${csvFilename('threat-intel-report').replace('.csv', '.txt')}"`
      );
      res.send(profileToTextReport(profile));
      return;
    }

    // Default: JSON
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

// ── GET /export/history ───────────────────────────────────────────────────────

const HISTORY_HEADERS = [
  'timestamp', 'query_id', 'ioc', 'type',
  'risk_score', 'risk_level', 'verdict',
  'feeds_queried', 'successful_feeds', 'failed_feeds', 'mitre_techniques',
];

type HistoryRow = {
  id: string;
  ioc_value: string;
  ioc_type: string;
  risk_score: number | null;
  queried_at: string;
  result_json: unknown;
};

function historyRowToCSV(row: HistoryRow): string {
  const raw = row.result_json;
  let profile: Partial<ThreatProfile> = {};
  try {
    profile = typeof raw === 'string'
      ? (JSON.parse(raw) as ThreatProfile)
      : (raw as ThreatProfile);
  } catch { /* use defaults */ }

  const feeds        = profile.feeds ?? [];
  const successful   = feeds.filter(f => f.status === 'success').length;
  const failed       = feeds.filter(f => f.status === 'failed' || f.status === 'timeout').length;
  const mitre        = (profile.mitreTechniques ?? []).map(m => m.id).join(' | ');

  return [
    isoOrNull(row.queried_at),
    safeStr(row.id),
    safeStr(row.ioc_value),
    safeStr(row.ioc_type),
    safeStr(row.risk_score ?? ''),
    safeStr(profile.riskLevel ?? ''),
    safeStr(profile.verdict ?? ''),
    safeStr(feeds.length),
    safeStr(successful),
    safeStr(failed),
    mitre,
  ].map(escapeCsvValue).join(',');
}

router.get('/history', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user   = req.user as UserPayload;
    const format = (req.query['format'] as string | undefined)?.toLowerCase() ?? 'csv';

    // ── Parse filter params ───────────────────────────────────────────────────
    const fromStr       = req.query['from']         as string | undefined;
    const toStr         = req.query['to']           as string | undefined;
    const minRiskStr    = req.query['minRiskScore'] as string | undefined;
    const maxRiskStr    = req.query['maxRiskScore'] as string | undefined;

    const fromDate   = fromStr    ? new Date(fromStr)    : null;
    const toDate     = toStr      ? new Date(toStr)      : null;
    const minRisk    = minRiskStr ? parseInt(minRiskStr, 10) : null;
    const maxRisk    = maxRiskStr ? parseInt(maxRiskStr, 10) : null;

    if (fromDate && isNaN(fromDate.getTime())) throw new ValidationError('Invalid "from" date', 'from');
    if (toDate   && isNaN(toDate.getTime()))   throw new ValidationError('Invalid "to" date',   'to');
    if (minRisk  !== null && (isNaN(minRisk)  || minRisk  < 0 || minRisk  > 100)) throw new ValidationError('minRiskScore must be 0–100', 'minRiskScore');
    if (maxRisk  !== null && (isNaN(maxRisk)  || maxRisk  < 0 || maxRisk  > 100)) throw new ValidationError('maxRiskScore must be 0–100', 'maxRiskScore');

    // ── Build parameterised WHERE clause ──────────────────────────────────────
    const conditions: string[] = ['user_id = $1'];
    const params: unknown[]    = [user.id];
    let   paramIdx             = 2;

    if (fromDate) { conditions.push(`queried_at >= $${paramIdx++}`); params.push(fromDate.toISOString()); }
    if (toDate)   { conditions.push(`queried_at <= $${paramIdx++}`); params.push(toDate.toISOString()); }
    if (minRisk !== null) { conditions.push(`risk_score >= $${paramIdx++}`); params.push(minRisk); }
    if (maxRisk !== null) { conditions.push(`risk_score <= $${paramIdx++}`); params.push(maxRisk); }

    const where = conditions.join(' AND ');

    // ── JSON format ───────────────────────────────────────────────────────────
    if (format === 'json') {
      const countResult = await dbQuery(
        `SELECT COUNT(*) FROM ioc_queries WHERE ${where}`, params
      );
      const total = parseInt(safeStr((countResult.rows[0] as Record<string, unknown>)?.count), 10) || 0;

      const dataResult = await dbQuery(
        `SELECT id, ioc_value, ioc_type, risk_score, queried_at, result_json
         FROM ioc_queries WHERE ${where}
         ORDER BY queried_at DESC LIMIT $${paramIdx}`,
        [...params, MAX_HISTORY_ROWS]
      );

      res.json({
        total: Math.min(total, MAX_HISTORY_ROWS),
        exported: dataResult.rows.length,
        rows: dataResult.rows.map(r => {
          const rr = r as HistoryRow;
          let profile: Partial<ThreatProfile> = {};
          try {
            profile = typeof rr.result_json === 'string'
              ? (JSON.parse(rr.result_json) as ThreatProfile)
              : (rr.result_json as ThreatProfile);
          } catch { /* use defaults */ }
          return {
            id:         rr.id,
            ioc:        rr.ioc_value,
            type:       rr.ioc_type,
            riskScore:  rr.risk_score,
            riskLevel:  profile.riskLevel,
            verdict:    profile.verdict,
            queriedAt:  isoOrNull(rr.queried_at),
          };
        }),
      });
      return;
    }

    // ── CSV streaming format (default) ────────────────────────────────────────
    setCsvHeaders(res, csvFilename('history'));
    // Write CSV header row immediately so the client sees the download start
    res.write(HISTORY_HEADERS.map(escapeCsvValue).join(',') + '\r\n');

    let offset = 0;
    let fetched = 0;

    while (fetched < MAX_HISTORY_ROWS) {
      const remaining = MAX_HISTORY_ROWS - fetched;
      const batchSize = Math.min(HISTORY_BATCH_SZ, remaining);

      const batch = await dbQuery(
        `SELECT id, ioc_value, ioc_type, risk_score, queried_at, result_json
         FROM ioc_queries WHERE ${where}
         ORDER BY queried_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, batchSize, offset]
      );

      if (batch.rows.length === 0) break;

      for (const row of batch.rows) {
        res.write(historyRowToCSV(row as HistoryRow) + '\r\n');
      }

      fetched += batch.rows.length;
      offset  += batch.rows.length;

      if (batch.rows.length < batchSize) break; // last page
    }

    res.end();
  } catch (err) {
    // If headers already sent (streaming started), we can't send an error body
    if (res.headersSent) {
      res.end();
    } else {
      next(err);
    }
  }
});

export default router;
