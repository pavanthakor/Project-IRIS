/**
 * Structured request-lifecycle logger.
 *
 * Attaches a `finish` listener to every response so it can capture:
 *   - responseTimeMs  (process.hrtime.bigint() precision)
 *   - responseBytes   (Content-Length header)
 *   - statusCode
 *
 * Log level:
 *   - INFO  for 2xx / 3xx
 *   - WARN  for 4xx
 *   - ERROR for 5xx
 *
 * Wire this middleware AFTER the requestId middleware so that
 * req.requestId is always available inside the finish callback.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';
import { trackRequest } from '../services/metricsService';
import logger from '../utils/logger';

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? 'unknown';
}

export function requestLogger(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startHr = process.hrtime.bigint();

    res.on('finish', () => {
      const durationNs  = process.hrtime.bigint() - startHr;
      const responseTimeMs = Number(durationNs / 1_000_000n);

      const statusCode = res.statusCode;

      const rawLength = res.getHeader('content-length');
      const responseBytes =
        typeof rawLength === 'string'  ? (parseInt(rawLength, 10) || 0)
        : typeof rawLength === 'number' ? rawLength
        : 0;

      const rawUa    = req.headers['user-agent'] ?? '';
      const userAgent = rawUa.slice(0, 200) || undefined;

      const logData: Record<string, unknown> = {
        requestId:      req.requestId ?? 'unknown',
        method:         req.method,
        path:           req.path,
        userId:         req.user?.id,
        ip:             getClientIp(req),
        userAgent,
        statusCode,
        responseTimeMs,
        responseBytes,
        timestamp:      new Date().toISOString(),
      };

      if (Object.keys(req.query).length > 0) {
        logData['query'] = req.query;
      }

      trackRequest(statusCode, responseTimeMs, req.path);

      if (statusCode >= 500) {
        logger.error('request_complete', logData);
      } else if (statusCode >= 400) {
        logger.warn('request_complete', logData);
      } else {
        logger.info('request_complete', logData);
      }
    });

    next();
  };
}
