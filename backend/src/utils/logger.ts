import { createLogger, format, transports } from 'winston';

const REDACT_KEYS = /password|secret|key|token|hash/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

const isProduction = process.env.NODE_ENV === 'production';

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const cloneAndRedact = (
  value: unknown,
  options: {
    redactKeys: RegExp;
    redactBody: boolean;
    maskPii: boolean;
  },
  keyHint?: string,
  visited: WeakMap<object, unknown> = new WeakMap()
): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (options.maskPii) {
      if (keyHint && /email/i.test(keyHint) && EMAIL_REGEX.test(value.trim())) {
        return maskEmail(value);
      }

      if (keyHint && /(ioc|ip|domain|url|entityValue|iocValue)/i.test(keyHint)) {
        return maskIoC(value);
      }

      // Best-effort: if it looks like an email and is not explicitly allowed, mask it.
      if (EMAIL_REGEX.test(value.trim())) {
        return maskEmail(value);
      }
    }

    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneAndRedact(item, options, keyHint, visited));
  }

  if (typeof value === 'object') {
    if (visited.has(value as object)) {
      return '[Circular]';
    }

    const output: Record<string, unknown> = {};
    visited.set(value as object, output);

    const entries = isPlainObject(value)
      ? Object.entries(value)
      : Object.entries(value as Record<string, unknown>);

    for (const [key, child] of entries) {
      if (options.redactBody && /^(?:body|requestBody|reqBody|payload)$/i.test(key)) {
        output[key] = '[REDACTED]';
        continue;
      }

      if (options.redactBody && /^(?:req|request|res|response)$/i.test(key)) {
        output[key] = '[REDACTED]';
        continue;
      }

      if (options.redactKeys.test(key)) {
        output[key] = '[REDACTED]';
        continue;
      }

      if (options.maskPii && /email/i.test(key) && typeof child === 'string') {
        output[key] = maskEmail(child);
        continue;
      }

      if (
        options.maskPii &&
        /(ioc|ip|domain|url|entityValue|iocValue)/i.test(key) &&
        typeof child === 'string'
      ) {
        output[key] = maskIoC(child);
        continue;
      }

      output[key] = cloneAndRedact(child, options, key, visited);
    }

    return output;
  }

  return String(value);
};

export function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
  // Per spec: deep clone and redact keys matching /password|secret|key|token|hash/i
  return cloneAndRedact(
    obj,
    { redactKeys: REDACT_KEYS, redactBody: false, maskPii: false },
    undefined,
    new WeakMap()
  ) as Record<string, unknown>;
}

export function maskEmail(email: string): string {
  const normalized = email.trim();
  if (!normalized) {
    return '';
  }

  const atIndex = normalized.indexOf('@');
  if (atIndex <= 0) {
    return normalized.length > 0 ? `${normalized[0]}***` : '***';
  }

  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const firstChar = local.length > 0 ? local[0] : '*';

  return `${firstChar}***@${domain}`;
}

export function maskIoC(ioc: string): string {
  const normalized = ioc.trim();
  if (!normalized) {
    return '';
  }

  // If an email sneaks in here, treat it as such.
  if (normalized.includes('@') && EMAIL_REGEX.test(normalized)) {
    return maskEmail(normalized);
  }

  if (IPV4_REGEX.test(normalized)) {
    const parts = normalized.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.x.x`;
    }
  }

  // Domain-ish input: keep first 4 chars of first label and the last label.
  if (!normalized.includes(' ') && normalized.includes('.') && !normalized.includes('/')) {
    const parts = normalized.split('.').filter(Boolean);
    if (parts.length >= 2) {
      const firstLabel = parts[0] ?? '';
      const tld = parts[parts.length - 1] ?? '';
      const prefix = firstLabel.slice(0, 4);
      return `${prefix}****.${tld}`;
    }
  }

  // Hash / unknown: show first 8 characters.
  if (normalized.length <= 8) {
    return '*'.repeat(normalized.length);
  }

  return `${normalized.slice(0, 8)}****`;
}

const enrichAndSanitizeFormat = format((info) => {
  const maybeRequestId = (info as Record<string, unknown>).requestId;
  const requestId =
    typeof maybeRequestId === 'string' && maybeRequestId.trim().length > 0
      ? maybeRequestId
      : 'unknown';

  const maybeUserId = (info as Record<string, unknown>).userId;
  const derivedUserId =
    typeof maybeUserId === 'string' && maybeUserId.trim().length > 0
      ? maybeUserId
      : null;

  (info as Record<string, unknown>).requestId = requestId;
  (info as Record<string, unknown>).userId = derivedUserId;

  const meta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(info)) {
    if (key === 'level' || key === 'message' || key === 'timestamp' || key === 'requestId' || key === 'userId') {
      continue;
    }
    meta[key] = value;
  }

  // Remove original meta keys before re-adding sanitized values.
  for (const key of Object.keys(meta)) {
    // Avoid dynamic deletes (lint rule). Undefined values are omitted by JSON.stringify.
    (info as Record<string, unknown>)[key] = undefined;
  }

  const sanitizedMeta = cloneAndRedact(
    meta,
    { redactKeys: REDACT_KEYS, redactBody: true, maskPii: true },
    undefined,
    new WeakMap()
  ) as Record<string, unknown>;

  Object.assign(info, sanitizedMeta);

  // Keep durationMs when it looks sane; drop it otherwise.
  const durationMs = (info as Record<string, unknown>).durationMs;
  if (durationMs !== undefined) {
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) {
      delete (info as Record<string, unknown>).durationMs;
    }
  }

  return info;
});

// NOTE: winston's timestamp({ format: 'ISO' }) does not produce ISO 8601 in this environment.
// Using a function formatter guarantees an ISO timestamp.
const baseFormat = format.combine(
  enrichAndSanitizeFormat(),
  format.timestamp({ format: () => new Date().toISOString() }),
  format.json()
);

const consoleFormat = isProduction
  ? baseFormat
  : format.combine(format.colorize({ all: true }), baseFormat);

const logger = createLogger({
  level: 'info',
  transports: [
    new transports.Console({
      level: 'info',
      format: consoleFormat
    }),
    new transports.File({
      filename: 'error.log',
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
      format: baseFormat
    })
  ]
});

export default logger;