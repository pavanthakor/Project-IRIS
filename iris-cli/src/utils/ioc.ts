import type { IoCType } from '../types';

const IPV4_REGEX =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

const IPV6_REGEX = /^(?:[0-9a-f]{1,4}:){1,7}[0-9a-f]{0,4}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HASH_REGEX = /^(?:[A-Fa-f0-9]{32}|[A-Fa-f0-9]{40}|[A-Fa-f0-9]{64})$/;
const DOMAIN_REGEX =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function isIoCType(value: string): value is IoCType {
  return value === 'ip' || value === 'domain' || value === 'hash' || value === 'email';
}

export function detectIoCType(input: string): IoCType | null {
  const value = input.trim();
  if (!value) return null;

  if (IPV4_REGEX.test(value) || IPV6_REGEX.test(value)) {
    return 'ip';
  }

  if (EMAIL_REGEX.test(value)) {
    return 'email';
  }

  if (HASH_REGEX.test(value)) {
    return 'hash';
  }

  if (DOMAIN_REGEX.test(value.toLowerCase())) {
    return 'domain';
  }

  return null;
}

export interface ParsedBulkLine {
  ioc: string;
  type: IoCType;
}

export function parseBulkLine(raw: string): ParsedBulkLine | null {
  const line = raw.trim();
  if (!line || line.startsWith('#')) {
    return null;
  }

  const typePrefix = line.match(/^(ip|domain|hash|email)\s*:\s*(.+)$/i);
  if (typePrefix) {
    const prefixedType = typePrefix[1]?.toLowerCase() ?? '';
    const prefixedValue = typePrefix[2]?.trim() ?? '';

    if (isIoCType(prefixedType) && prefixedValue) {
      return { ioc: prefixedValue, type: prefixedType };
    }
  }

  const commaParts = line.split(',').map(part => part.trim());
  if (commaParts.length === 2) {
    const left = commaParts[0]?.toLowerCase() ?? '';
    const right = commaParts[1]?.toLowerCase() ?? '';
    const firstValue = commaParts[0] ?? '';
    const secondValue = commaParts[1] ?? '';

    if (isIoCType(left) && secondValue) {
      return { ioc: secondValue, type: left };
    }

    if (isIoCType(right) && firstValue) {
      return { ioc: firstValue, type: right };
    }
  }

  const autoType = detectIoCType(line);
  if (!autoType) {
    return null;
  }

  return { ioc: line, type: autoType };
}
