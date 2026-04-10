import type { IoCType } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// IoC validation patterns (client-side quick checks)
// Note: The backend performs the authoritative validation.
// ─────────────────────────────────────────────────────────────────────────────

const IPV4_OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_PATTERN = `(?:${IPV4_OCTET}\\.){3}${IPV4_OCTET}`;

// IPv6: supports full + :: compressed forms (format validation).
// This intentionally does not attempt to exclude reserved IPv6 ranges.
const IPV6_PATTERN =
	'(?:' +
	// Full form
	'(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}' +
	'|' +
	// Compressed forms
	'(?:[0-9A-Fa-f]{1,4}:){1,7}:' +
	'|' +
	'(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}' +
	'|' +
	'(?:[0-9A-Fa-f]{1,4}:){1,5}(?::[0-9A-Fa-f]{1,4}){1,2}' +
	'|' +
	'(?:[0-9A-Fa-f]{1,4}:){1,4}(?::[0-9A-Fa-f]{1,4}){1,3}' +
	'|' +
	'(?:[0-9A-Fa-f]{1,4}:){1,3}(?::[0-9A-Fa-f]{1,4}){1,4}' +
	'|' +
	'(?:[0-9A-Fa-f]{1,4}:){1,2}(?::[0-9A-Fa-f]{1,4}){1,5}' +
	'|' +
	'[0-9A-Fa-f]{1,4}:(?::[0-9A-Fa-f]{1,4}){1,6}' +
	'|' +
	':(?::[0-9A-Fa-f]{1,4}){1,7}' +
	'|' +
	'::' +
	')';

const DOMAIN_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const DOMAIN_PATTERN = `(?=.{1,253}$)(?:${DOMAIN_LABEL}\\.)+${DOMAIN_LABEL}`;

const HASH_PATTERN = '(?!(?:0)+$)(?!(?:f|F)+$)(?:[0-9a-fA-F]{32}|[0-9a-fA-F]{40}|[0-9a-fA-F]{64})';

const EMAIL_LOCAL_PATTERN = '[^\\s@]{1,64}';
const EMAIL_PATTERN = `(?=.{1,254}$)${EMAIL_LOCAL_PATTERN}@(?:${DOMAIN_LABEL}\\.)+${DOMAIN_LABEL}`;

export const IOC_PATTERNS: Record<IoCType, RegExp> = {
	ip: new RegExp(`^(?:${IPV4_PATTERN}|${IPV6_PATTERN})$`),
	domain: new RegExp(`^${DOMAIN_PATTERN}$`, 'i'),
	hash: new RegExp(`^${HASH_PATTERN}$`),
	email: new RegExp(`^${EMAIL_PATTERN}$`, 'i'),
};

// ─────────────────────────────────────────────────────────────────────────────
// Feed metadata (used for UI badges, charts, and tables)
// ─────────────────────────────────────────────────────────────────────────────

export type FeedConfig = {
	name: string;
	endpoint: string;
	supportedTypes: readonly IoCType[];
	color: string; // hex or CSS color string
};

export const FEED_CONFIG: readonly FeedConfig[] = [
	{
		name: 'VirusTotal',
		endpoint: 'https://www.virustotal.com/api/v3',
		supportedTypes: ['ip', 'domain', 'hash'],
		color: '#c5f467',
	},
	{
		name: 'AbuseIPDB',
		endpoint: 'https://api.abuseipdb.com/api/v2',
		supportedTypes: ['ip'],
		color: '#f59e0b',
	},
	{
		name: 'Shodan',
		endpoint: 'https://api.shodan.io',
		supportedTypes: ['ip'],
		color: '#3b82f6',
	},
	{
		name: 'IPInfo',
		endpoint: 'https://ipinfo.io',
		supportedTypes: ['ip'],
		color: '#22c55e',
	},
	{
		name: 'AbstractEmail',
		endpoint: 'https://emailreputation.abstractapi.com/v1',
		supportedTypes: ['email'],
		color: '#a78bfa',
	},
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// MITRE ATT&CK tactic color mapping
// ─────────────────────────────────────────────────────────────────────────────

export const TACTIC_COLORS: Record<string, { bg: string; text: string }> = {
	'Initial Access': { bg: 'bg-rose-500/10', text: 'text-rose-300' },
	Execution: { bg: 'bg-orange-500/10', text: 'text-orange-300' },
	Persistence: { bg: 'bg-amber-500/10', text: 'text-amber-300' },
	'Privilege Escalation': { bg: 'bg-yellow-500/10', text: 'text-yellow-300' },
	'Defense Evasion': { bg: 'bg-lime-500/10', text: 'text-lime-300' },
	'Credential Access': { bg: 'bg-emerald-500/10', text: 'text-emerald-300' },
	Discovery: { bg: 'bg-teal-500/10', text: 'text-teal-300' },
	'Lateral Movement': { bg: 'bg-cyan-500/10', text: 'text-cyan-300' },
	Collection: { bg: 'bg-sky-500/10', text: 'text-sky-300' },
	'Command and Control': { bg: 'bg-blue-500/10', text: 'text-blue-300' },
	Exfiltration: { bg: 'bg-indigo-500/10', text: 'text-indigo-300' },
	Impact: { bg: 'bg-violet-500/10', text: 'text-violet-300' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Risk thresholds
// ─────────────────────────────────────────────────────────────────────────────

export const RISK_THRESHOLDS = {
	critical: 80,
	high: 60,
	medium: 40,
	low: 20,
} as const;
