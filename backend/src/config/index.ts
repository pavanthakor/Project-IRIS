import dotenv from 'dotenv';
import logger from '../utils/logger';

dotenv.config();

const DEFAULT_JWT_SECRET = 'dev-secret-change-in-production';

const toInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (raw: string | undefined, fallback: boolean): boolean => {
  if (raw === undefined) {
    return fallback;
  }
  return String(raw).toLowerCase() !== 'false';
};

const envFlag = (name: string): boolean => process.env[name] !== 'false';

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  readonly port: number;
  readonly nodeEnv: string;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly jwtSecret: string;
  readonly corsOrigin: string;
  readonly virusTotalApiKey: string;
  readonly abuseIPDBApiKey: string;
  readonly shodanApiKey: string;
  readonly ipInfoApiKey: string;
  readonly abstractEmailApiKey: string;
  readonly cacheEnabled: boolean;
  readonly authRequired: boolean;
}

export const config: AppConfig = {
  port: toInt(process.env.PORT || '3001', 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/threat_intel',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  virusTotalApiKey: process.env.VIRUSTOTAL_API_KEY || '',
  abuseIPDBApiKey: process.env.ABUSEIPDB_API_KEY || '',
  shodanApiKey: process.env.SHODAN_API_KEY || '',
  ipInfoApiKey: process.env.IPINFO_API_KEY || '',
  abstractEmailApiKey: process.env.ABSTRACT_EMAIL_API_KEY || '',
  cacheEnabled: toBool(process.env.CACHE_ENABLED, true),
  authRequired: toBool(process.env.AUTH_REQUIRED, true),
};

if (config.nodeEnv === 'production' && config.jwtSecret === DEFAULT_JWT_SECRET) {
  throw new Error(
    'JWT_SECRET must be set to a secure value in production (default value detected).'
  );
}

const feedFlags = {
  VirusTotal: envFlag('FEED_VIRUSTOTAL_ENABLED'),
  AbuseIPDB: envFlag('FEED_ABUSEIPDB_ENABLED'),
  Shodan: envFlag('FEED_SHODAN_ENABLED'),
  IPInfo: envFlag('FEED_IPINFO_ENABLED'),
  AbstractEmail: envFlag('FEED_ABSTRACTEMAIL_ENABLED'),
};

const enabledFeeds = Object.entries(feedFlags)
  .filter(([, enabled]) => enabled)
  .map(([name]) => name);
const disabledFeeds = Object.entries(feedFlags)
  .filter(([, enabled]) => !enabled)
  .map(([name]) => name);

logger.info('startup_feed_flags', {
  enabledFeeds,
  disabledFeeds,
});

// Legacy named exports used by feed connectors.
export const VIRUSTOTAL_API_KEY = config.virusTotalApiKey;
export const ABUSEIPDB_API_KEY = config.abuseIPDBApiKey;
export const SHODAN_API_KEY = config.shodanApiKey;
export const IPINFO_API_KEY = config.ipInfoApiKey;
export const ABSTRACT_EMAIL_API_KEY = config.abstractEmailApiKey;

export default config;