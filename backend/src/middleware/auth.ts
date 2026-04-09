import { createHash } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import config from '../config';
import { dbQuery, redis } from '../config/database';
import { AuthError } from '../errors';
import { fireAudit } from '../services/auditService';
import { UserPayload } from '../types';

// ── JWT configuration ─────────────────────────────────────────────────────────

const JWT_ISSUER   = 'threat-intel-api';
const JWT_AUDIENCE = 'threat-intel-platform';
const MAX_TOKEN_AGE_SECS = 24 * 60 * 60;

interface DecodedToken extends UserPayload {
  readonly jti: string;
  readonly iat: number;
  readonly exp: number;
}

// ── Token generation ──────────────────────────────────────────────────────────

export function generateToken(payload: UserPayload): string {
  const jti = uuidv4();
  return jwt.sign(
    { id: payload.id, email: payload.email, tier: payload.tier, jti },
    config.jwtSecret,
    {
      algorithm:  'HS256',
      expiresIn:  '24h',
      issuer:     JWT_ISSUER,
      audience:   JWT_AUDIENCE,
    }
  );
}

// ── Token blacklist (logout / revocation) ─────────────────────────────────────

/**
 * Add a JTI to the blacklist in Redis.  TTL is set to the token's remaining
 * lifetime so the entry self-evicts after it would have expired anyway.
 */
export async function blacklistToken(jti: string, exp: number): Promise<void> {
  const ttl = exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) {
    await redis.set(`tip:token:blacklist:${jti}`, '1', 'EX', ttl);
  }
}

async function isBlacklisted(jti: string): Promise<boolean> {
  try {
    return (await redis.exists(`tip:token:blacklist:${jti}`)) === 1;
  } catch {
    // If Redis is down, fail-open (don't block legitimate requests)
    return false;
  }
}

// ── Tier normalizer (duplicate from routes/auth — avoids circular import) ─────

function normalizeTier(tier: unknown): UserPayload['tier'] {
  return tier === 'pro' || tier === 'enterprise' || tier === 'free' ? tier : 'free';
}

// ── Main auth middleware ───────────────────────────────────────────────────────

/**
 * Verify authentication via:
 *   1. Bearer JWT in Authorization header (primary)
 *   2. Raw API key in X-API-Key header (fallback)
 *
 * Rejects if neither is present or both are invalid.
 */
export const verifyAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const ip  = req.ip ?? 'unknown';
  const ua  = (req.headers['user-agent'] ?? '').slice(0, 200);
  const rid = req.requestId ?? 'unknown';

  const auditDenied = (reason: string) =>
    fireAudit({
      action: 'auth_failed', details: { reason },
      ipAddress: ip, userAgent: ua, requestId: rid, outcome: 'denied',
    });

  try {
    const authHeader = req.headers.authorization;

    // ── Path 1: Bearer JWT ──────────────────────────────────────────────────
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (!token) {
        auditDenied('missing_bearer_token');
        return next(new AuthError('Missing or invalid authorization header'));
      }

      let decoded: DecodedToken;
      try {
        decoded = jwt.verify(token, config.jwtSecret, {
          algorithms: ['HS256'],
          audience:   JWT_AUDIENCE,
          issuer:     JWT_ISSUER,
        }) as unknown as DecodedToken;
      } catch {
        auditDenied('invalid_or_expired_token');
        return next(new AuthError('Invalid or expired token'));
      }

      // Reject tokens older than 24h (defense-in-depth; expiresIn already enforces this)
      if (Date.now() / 1000 - decoded.iat > MAX_TOKEN_AGE_SECS) {
        auditDenied('token_exceeded_max_age');
        return next(new AuthError('Token has exceeded maximum age'));
      }

      // Blacklist check (revoked via logout)
      if (await isBlacklisted(decoded.jti)) {
        auditDenied('token_revoked');
        return next(new AuthError('Token has been revoked'));
      }

      req.user = {
        id:    decoded.id,
        email: decoded.email,
        tier:  normalizeTier(decoded.tier),
        jti:   decoded.jti,
      };
      return next();
    }

    // ── Path 2: X-API-Key ───────────────────────────────────────────────────
    const apiKey = req.headers['x-api-key'];
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      const keyHash = createHash('sha256').update(apiKey).digest('hex');

      const result = await dbQuery<{ id: string; email: string; tier: string }>(
        'SELECT id, email, tier FROM users WHERE api_key = $1',
        [keyHash]
      );

      if (!result.rows[0]) {
        auditDenied('invalid_api_key');
        return next(new AuthError('Invalid API key'));
      }

      const user = result.rows[0];
      req.user = { id: user.id, email: user.email, tier: normalizeTier(user.tier) };
      return next();
    }

    // ── Neither present ─────────────────────────────────────────────────────
    auditDenied('missing_authorization');
    return next(new AuthError('Missing or invalid authorization header'));

  } catch (err) {
    return next(err);
  }
};
