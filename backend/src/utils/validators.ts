/**
 * Production-grade IoC and input validators.
 *
 * All functions are pure (no side-effects, no I/O) and return a result
 * object so callers can decide how to surface errors.
 */

// ── sanitizeString ─────────────────────────────────────────────────────────

/**
 * Strip HTML tags, remove null bytes, and trim whitespace.
 * Throws if the input contains a null byte (they are never legitimate
 * in IoC values and indicate attempted injection).
 */
export function sanitizeString(input: string): string {
  if (input.includes('\x00')) {
    throw new Error('Input contains null bytes');
  }
  // Strip HTML tags (angle-bracket content).
  return input.replace(/<[^>]*>/g, '').trim();
}

// ── IPv4 helpers ────────────────────────────────────────────────────────────

function ipv4ToUint32(octets: readonly number[]): number {
  // Array is always 4 elements when called from validateIP; default to 0 to satisfy lint.
  return (
    (((octets[0] ?? 0) << 24) | ((octets[1] ?? 0) << 16) | ((octets[2] ?? 0) << 8) | (octets[3] ?? 0)) >>> 0
  );
}

function maskFromPrefix(prefix: number): number {
  return prefix === 0 ? 0 : ((~0 << (32 - prefix)) >>> 0);
}

function inCidr(
  ip: number,
  networkOctets: readonly [number, number, number, number],
  prefix: number
): boolean {
  const network = ipv4ToUint32(networkOctets);
  const mask = maskFromPrefix(prefix);
  return (ip & mask) === (network & mask);
}

// RFC 5735 / RFC 1918 / RFC 3927 / RFC 3171 private & reserved ranges
const PRIVATE_RANGES_V4: ReadonlyArray<{
  label: string;
  network: readonly [number, number, number, number];
  prefix: number;
}> = [
  { label: 'Loopback',           network: [127,   0,   0,   0], prefix:  8 },
  { label: 'Private (10/8)',      network: [ 10,   0,   0,   0], prefix:  8 },
  { label: 'Private (172.16/12)', network: [172,  16,   0,   0], prefix: 12 },
  { label: 'Private (192.168/16)',network: [192, 168,   0,   0], prefix: 16 },
  { label: 'Current network',     network: [  0,   0,   0,   0], prefix:  8 },
  { label: 'Link-local',          network: [169, 254,   0,   0], prefix: 16 },
  { label: 'Multicast',           network: [224,   0,   0,   0], prefix:  4 },
  { label: 'Reserved',            network: [240,   0,   0,   0], prefix:  4 },
  { label: 'Broadcast',           network: [255, 255, 255, 255], prefix: 32 },
];

// ── IPv6 helpers ────────────────────────────────────────────────────────────

/**
 * Validates a bare IPv6 address (no brackets, no port suffix).
 * Accepts full form, `::` compressed form, and the `::ffff:d.d.d.d` mapped form.
 */
function isValidIPv6Bare(ip: string): boolean {
  // At most one "::"
  const doubleColons = ip.split('::');
  if (doubleColons.length > 2) return false;

  if (doubleColons.length === 2) {
    // Compressed form
    const left  = doubleColons[0] !== '' ? (doubleColons[0] ?? '').split(':') : [];
    const right = doubleColons[1] !== '' ? (doubleColons[1] ?? '').split(':') : [];

    // The last right group might be an IPv4 address
    const lastRight = right[right.length - 1] ?? '';
    if (right.length > 0 && lastRight.includes('.')) {
      // IPv4-mapped: validate the IPv4 part, count as 2 groups
      const ipv4Parts = lastRight.split('.');
      if (ipv4Parts.length !== 4) return false;
      if (!ipv4Parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return false;
      const combined = [...left, ...right.slice(0, -1)];
      if (combined.length + 2 > 8) return false;
      return combined.every(g => /^[0-9a-fA-F]{1,4}$/.test(g));
    }

    if (left.length + right.length >= 8) return false;
    const allGroups = [...left, ...right];
    return allGroups.every(g => /^[0-9a-fA-F]{1,4}$/.test(g));
  }

  // Full form: exactly 8 colon-separated groups
  const groups = ip.split(':');
  if (groups.length !== 8) return false;
  return groups.every(g => /^[0-9a-fA-F]{1,4}$/.test(g));
}

// ── validateIP ─────────────────────────────────────────────────────────────

export interface IPValidationResult {
  readonly valid: boolean;
  readonly error?: string;
  readonly isPrivate?: boolean;
  readonly version?: 4 | 6;
}

export function validateIP(ip: string): IPValidationResult {
  const trimmed = ip.trim();

  // ── Try IPv4 ────────────────────────────────────────────────────────────
  const v4Parts = trimmed.split('.');
  if (v4Parts.length === 4 && !trimmed.includes(':')) {
    for (const part of v4Parts) {
      // Reject leading zeros (e.g. "08" is octal-ambiguous)
      if (/^0\d/.test(part)) {
        return { valid: false, error: `Invalid IP: leading zeros in octet "${part}"` };
      }
      if (!/^\d+$/.test(part)) {
        return { valid: false, error: `Invalid IP: non-numeric octet "${part}"` };
      }
      const n = Number(part);
      if (n > 255) {
        return { valid: false, error: `Invalid IP: octet ${n} is out of range (0–255)` };
      }
    }

    const octets = v4Parts.map(Number) as [number, number, number, number];
    const uint32 = ipv4ToUint32(octets);

    const privateRange = PRIVATE_RANGES_V4.find(r => inCidr(uint32, r.network, r.prefix));
    if (privateRange) {
      return {
        valid: false,
        isPrivate: true,
        error: `Private/reserved IP addresses are not accepted (${privateRange.label})`,
      };
    }

    return { valid: true, version: 4 };
  }

  // ── Try IPv6 ────────────────────────────────────────────────────────────
  // Strip optional surrounding brackets (e.g. from URL notation)
  const v6Bare = trimmed.startsWith('[') && trimmed.endsWith(']')
    ? trimmed.slice(1, -1)
    : trimmed;

  if (v6Bare.includes(':')) {
    if (!isValidIPv6Bare(v6Bare)) {
      return { valid: false, error: 'Invalid IPv6 address format' };
    }
    return { valid: true, version: 6 };
  }

  return { valid: false, error: 'Not a valid IPv4 or IPv6 address' };
}

// ── validateDomain ─────────────────────────────────────────────────────────

export interface DomainValidationResult {
  readonly valid: boolean;
  readonly error?: string;
  readonly normalized?: string;
}

// Known single-label TLDs that people sometimes submit as "domains"
const BARE_TLDS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'io', 'co', 'uk', 'de',
  'fr', 'jp', 'cn', 'ru', 'br', 'in', 'au', 'ca', 'us',
]);

export function validateDomain(domain: string): DomainValidationResult {
  // Normalize: lowercase, strip trailing dot
  const normalized = domain.toLowerCase().replace(/\.+$/, '');

  if (normalized.length === 0) {
    return { valid: false, error: 'Domain is empty' };
  }
  if (normalized.length > 253) {
    return { valid: false, error: 'Domain exceeds 253 character limit' };
  }
  if (normalized.includes('..')) {
    return { valid: false, error: 'Domain contains consecutive dots' };
  }

  // Reject IPv4 addresses submitted as domains
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(normalized)) {
    return { valid: false, error: 'Value appears to be an IP address, not a domain' };
  }

  const labels = normalized.split('.');

  // Must have at least two labels (label + TLD)
  if (labels.length < 2) {
    return {
      valid: false,
      error: BARE_TLDS.has(normalized)
        ? 'Domain must include at least one label before the TLD (bare TLD rejected)'
        : 'Domain must contain at least one dot',
    };
  }

  for (const label of labels) {
    if (label.length === 0) {
      return { valid: false, error: 'Domain contains an empty label' };
    }
    if (label.length > 63) {
      return { valid: false, error: `Domain label "${label.slice(0, 20)}…" exceeds 63 character limit` };
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label) && !/^[a-z0-9]$/.test(label)) {
      return { valid: false, error: `Domain label "${label}" contains invalid characters` };
    }
  }

  return { valid: true, normalized };
}

// ── validateHash ───────────────────────────────────────────────────────────

export type HashType = 'md5' | 'sha1' | 'sha256';

export interface HashValidationResult {
  readonly valid: boolean;
  readonly error?: string;
  readonly hashType?: HashType;
}

const HASH_LENGTHS: Record<number, HashType> = {
  32: 'md5',
  40: 'sha1',
  64: 'sha256',
};

export function validateHash(hash: string): HashValidationResult {
  const lower = hash.toLowerCase();

  if (!/^[0-9a-f]+$/.test(lower)) {
    return { valid: false, error: 'Hash contains non-hexadecimal characters' };
  }

  const hashType = HASH_LENGTHS[lower.length];
  if (!hashType) {
    return {
      valid: false,
      error: `Hash length ${lower.length} does not match MD5 (32), SHA1 (40), or SHA256 (64)`,
    };
  }

  // Reject sentinel/test values that waste API quota
  if (/^0+$/.test(lower)) {
    return { valid: false, error: 'All-zero hash rejected (test/sentinel value)' };
  }
  if (/^f+$/.test(lower)) {
    return { valid: false, error: 'All-F hash rejected (test/sentinel value)' };
  }

  return { valid: true, hashType };
}

// ── validateEmail ──────────────────────────────────────────────────────────

export interface EmailValidationResult {
  readonly valid: boolean;
  readonly error?: string;
  readonly normalized?: string;
  readonly typoSuggestion?: string;
}

// Common domain-part typos → correct domain
const TYPO_DOMAINS: Readonly<Record<string, string>> = {
  // Gmail variants
  'gmial.com':   'gmail.com',
  'gmai.com':    'gmail.com',
  'gmal.com':    'gmail.com',
  'gmali.com':   'gmail.com',
  'gmil.com':    'gmail.com',
  'gmail.co':    'gmail.com',
  'gnail.com':   'gmail.com',
  // Yahoo variants
  'yahooo.com':  'yahoo.com',
  'yaho.com':    'yahoo.com',
  'yahoo.co':    'yahoo.com',
  'yhoo.com':    'yahoo.com',
  // Hotmail / Outlook
  'hotmial.com': 'hotmail.com',
  'hotmal.com':  'hotmail.com',
  'hotmai.com':  'hotmail.com',
  'outlok.com':  'outlook.com',
  'outook.com':  'outlook.com',
  'outloook.com':'outlook.com',
  // iCloud
  'icoud.com':   'icloud.com',
  'iclod.com':   'icloud.com',
};

export function validateEmail(email: string): EmailValidationResult {
  const trimmed = email.trim();

  if (trimmed.length > 254) {
    return { valid: false, error: 'Email address exceeds 254 character limit' };
  }

  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0) {
    return { valid: false, error: 'Email address is missing the "@" symbol' };
  }

  const local  = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1).toLowerCase();

  if (local.length > 64) {
    return { valid: false, error: 'Email local part exceeds 64 character limit' };
  }
  if (local.length === 0) {
    return { valid: false, error: 'Email local part is empty' };
  }
  if (domain.length === 0) {
    return { valid: false, error: 'Email domain part is empty' };
  }

  // Domain must have at least one dot, no consecutive dots, no leading/trailing dot
  if (
    !domain.includes('.') ||
    domain.includes('..') ||
    domain.startsWith('.') ||
    domain.endsWith('.')
  ) {
    return { valid: false, error: 'Email domain is not valid' };
  }

  const normalized  = `${local.toLowerCase()}@${domain}`;
  const typoSuggestion = TYPO_DOMAINS[domain];

  return { valid: true, normalized, typoSuggestion };
}
