import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import {
  dbQuery,
  DatabaseError as PgDatabaseError,
  redis,
} from '../config/database';
import { generateToken, verifyAuth, blacklistToken } from '../middleware/auth';
import { createFixedRateLimiter } from '../middleware/advancedRateLimiter';
import { validate } from '../middleware/validate';
import { fireAudit } from '../services/auditService';
import { RateLimitError } from '../errors';
import { UserPayload } from '../types';

// ── Per-IP rate limiters (brute-force / signup-abuse) ────────────────────────

const loginLimiter    = createFixedRateLimiter(10, 'login');
const registerLimiter = createFixedRateLimiter(3,  'register');

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/** Minimum response time (ms) for auth endpoints — prevents timing oracle attacks. */
const AUTH_MIN_MS = 200;

async function timingJitter(startMs: number): Promise<void> {
  const elapsed = Date.now() - startMs;
  if (elapsed < AUTH_MIN_MS) {
    await sleep(AUTH_MIN_MS - elapsed + Math.random() * 50);
  }
}

// ── Account lockout (per-email, Redis) ───────────────────────────────────────

const MAX_LOGIN_FAILURES = 5;
const LOCKOUT_SECS       = 15 * 60; // 900 s

function lockoutKey(email: string): string {
  return 'tip:login:failures:' + createHash('sha256').update(email.toLowerCase()).digest('hex');
}

async function checkLockout(email: string): Promise<void> {
  try {
    const raw      = await redis.get(lockoutKey(email));
    const failures = raw ? parseInt(raw, 10) : 0;
    if (failures >= MAX_LOGIN_FAILURES) {
      const ttl     = await redis.ttl(lockoutKey(email));
      const minutes = Math.ceil(Math.max(ttl, 0) / 60);
      throw new RateLimitError(
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
      );
    }
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    // Redis unavailable — fail-open, don't block legitimate logins
  }
}

async function recordLoginFailure(email: string): Promise<void> {
  try {
    const key   = lockoutKey(email);
    const count = await redis.incr(key);
    if (count === 1) {
      // Set TTL only on first failure; window is fixed from that point
      await redis.expire(key, LOCKOUT_SECS);
    }
  } catch {
    // Non-critical — fail silently
  }
}

async function clearLoginFailures(email: string): Promise<void> {
  try {
    await redis.del(lockoutKey(email));
  } catch {
    // Non-critical
  }
}

// ── Common passwords (top ~100) ───────────────────────────────────────────────

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd',
  '123456', '1234567', '12345678', '123456789', '1234567890',
  'qwerty', 'qwerty123', 'qwertyuiop', 'abc123', 'abcdef',
  'letmein', 'welcome', 'monkey', 'dragon', 'master',
  'shadow', 'sunshine', 'princess', 'football', 'baseball',
  'iloveyou', 'trustno1', 'superman', 'batman', 'starwars',
  'michael', 'jessica', 'ashley', 'bailey', 'charlie',
  'donald', 'george', 'jordan', 'harley', 'ranger',
  'tigger', 'thomas', 'robert', 'daniel', 'andrew',
  'admin', 'administrator', 'root', 'toor', 'pass',
  'test', 'test123', 'testing', 'demo', 'guest',
  'login', 'changeme', 'temp', 'temp123', 'secret',
  '111111', '222222', '333333', '555555', '666666',
  '777777', '888888', '999999', '000000', '121212',
  '654321', '987654', '123321', '112233', '696969',
  'qazwsx', 'zxcvbn', 'asdfgh', 'zaq12wsx', 'q1w2e3r4',
  'myspace1', 'myspace', 'facebook', 'google', 'twitter',
  'linkedin', 'instagram', 'snapchat', 'youtube', 'netflix',
  'hunter2', 'hunter', 'killer', 'hacker', 'ninja',
  'maverick', 'freedom', 'liberty', 'justice', 'america',
  'soccer', 'hockey', 'tennis', 'golf', 'cricket',
  'guitar', 'music', 'summer', 'winter', 'spring',
]);

// ── Validation schemas ────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8,   'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .refine(p => /[A-Z]/.test(p),  { message: 'Password must contain at least one uppercase letter' })
    .refine(p => /[a-z]/.test(p),  { message: 'Password must contain at least one lowercase letter' })
    .refine(p => /\d/.test(p),     { message: 'Password must contain at least one digit' })
    .refine(p => !COMMON_PASSWORDS.has(p.toLowerCase()), { message: 'Password is too common' }),
});

type RegisterBody = z.infer<typeof registerSchema>;

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

type LoginBody = z.infer<typeof loginSchema>;

// ── Utilities ─────────────────────────────────────────────────────────────────

const normalizeTier = (tier: unknown): UserPayload['tier'] =>
  tier === 'pro' || tier === 'enterprise' || tier === 'free' ? tier : 'free';

const getRequestId = (requestId: string | undefined): string => requestId ?? 'unknown';

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof PgDatabaseError && error.code === '23505';

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();

// ── POST /register ────────────────────────────────────────────────────────────

router.post(
  '/register',
  registerLimiter,
  validate(registerSchema),
  async (req, res, next) => {
    const start = Date.now();
    try {
      const { email, password } = req.body as RegisterBody;
      const ip  = req.ip ?? 'unknown';
      const ua  = (req.headers['user-agent'] ?? '').slice(0, 200);
      const rid = req.requestId ?? 'unknown';

      const passwordHash = await bcrypt.hash(password, 12);

      const insertResult = await dbQuery<{ id: string; email: string; tier: string }>(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, tier',
        [email, passwordHash]
      );

      const userRow = insertResult.rows[0];
      if (!userRow) throw new Error('User insert returned no rows');

      const tier  = normalizeTier(userRow.tier);
      const token = generateToken({ id: userRow.id, email: userRow.email, tier });

      fireAudit({
        userId:     userRow.id,
        action:     'user_registered',
        resource:   'user',
        resourceId: userRow.id,
        details:    {},
        ipAddress:  ip,
        userAgent:  ua,
        requestId:  rid,
        outcome:    'success',
      });

      await timingJitter(start);
      res.status(201).json({ id: userRow.id, email: userRow.email, token });

    } catch (error) {
      if (isUniqueViolation(error)) {
        fireAudit({
          action:    'user_registered',
          resource:  'user',
          details:   { reason: 'email_already_registered' },
          ipAddress: req.ip ?? 'unknown',
          userAgent: (req.headers['user-agent'] ?? '').slice(0, 200),
          requestId: req.requestId ?? 'unknown',
          outcome:   'failure',
        });
        await timingJitter(start);
        res.status(409).json({
          error: {
            code:      'AUTH_ERROR',
            message:   'Email already registered',
            requestId: getRequestId(req.requestId),
          },
        });
        return;
      }
      next(error);
    }
  }
);

// ── POST /login ───────────────────────────────────────────────────────────────

router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  async (req, res, next) => {
    const start = Date.now();
    const { email, password } = req.body as LoginBody;
    const ip  = req.ip ?? 'unknown';
    const ua  = (req.headers['user-agent'] ?? '').slice(0, 200);
    const rid = req.requestId ?? 'unknown';

    const auditFailure = (reason: string, userId?: string) =>
      fireAudit({
        userId,
        action:    'user_login',
        resource:  'user',
        details:   { reason },
        ipAddress: ip,
        userAgent: ua,
        requestId: rid,
        outcome:   'failure',
      });

    try {
      // Account lockout check (before hitting the DB)
      await checkLockout(email);

      const userResult = await dbQuery<{
        id: string; email: string; password_hash: string; tier: string;
      }>('SELECT id, email, password_hash, tier FROM users WHERE email = $1', [email]);

      const userRow = userResult.rows[0];

      if (!userRow) {
        // Constant-time comparison to prevent user enumeration
        await bcrypt.compare(password, '$2b$12$invalidhashpadding00000000000000000000000000000000000');
        await recordLoginFailure(email);
        auditFailure('invalid_credentials');
        await timingJitter(start);
        res.status(401).json({
          error: { code: 'AUTH_ERROR', message: 'Invalid email or password', requestId: getRequestId(req.requestId) },
        });
        return;
      }

      const passwordOk = await bcrypt.compare(password, userRow.password_hash);
      if (!passwordOk) {
        await recordLoginFailure(email);
        auditFailure('invalid_credentials', userRow.id);
        await timingJitter(start);
        res.status(401).json({
          error: { code: 'AUTH_ERROR', message: 'Invalid email or password', requestId: getRequestId(req.requestId) },
        });
        return;
      }

      // Successful login — clear failure counter
      await clearLoginFailures(email);

      const tier  = normalizeTier(userRow.tier);
      const token = generateToken({ id: userRow.id, email: userRow.email, tier });

      fireAudit({
        userId:     userRow.id,
        action:     'user_login',
        resource:   'user',
        resourceId: userRow.id,
        details:    {},
        ipAddress:  ip,
        userAgent:  ua,
        requestId:  rid,
        outcome:    'success',
      });

      await timingJitter(start);
      res.status(200).json({ id: userRow.id, email: userRow.email, tier, token });

    } catch (err) {
      if (err instanceof RateLimitError) {
        await timingJitter(start);
        res.status(429).json({
          error: {
            code:      'ACCOUNT_LOCKED',
            message:   err.message,
            requestId: getRequestId(req.requestId),
          },
        });
        return;
      }
      next(err);
    }
  }
);

// ── POST /logout ──────────────────────────────────────────────────────────────

router.post('/logout', verifyAuth, async (req, res, next) => {
  try {
    const user = req.user as UserPayload;

    if (user.jti) {
      // Decode (no re-verify needed — verifyAuth already validated) to get exp
      const rawToken = (req.headers.authorization as string).split(' ')[1] ?? '';
      const decoded  = jwt.decode(rawToken) as { exp?: number } | null;
      if (decoded?.exp) {
        await blacklistToken(user.jti, decoded.exp);
      }
    }

    fireAudit({
      userId:    user.id,
      action:    'user_logout',
      resource:  'user',
      resourceId: user.id,
      details:   {},
      ipAddress: req.ip ?? 'unknown',
      userAgent: (req.headers['user-agent'] ?? '').slice(0, 200),
      requestId: req.requestId ?? 'unknown',
      outcome:   'success',
    });

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// ── POST /api-key ─────────────────────────────────────────────────────────────

router.post('/api-key', verifyAuth, async (req, res, next) => {
  try {
    const user = req.user as UserPayload;

    // Raw key: "tip_" + 32 random bytes as hex (68 chars total)
    const rawKey  = 'tip_' + randomBytes(32).toString('hex');
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    await dbQuery('UPDATE users SET api_key = $1 WHERE id = $2', [keyHash, user.id]);

    fireAudit({
      userId:    user.id,
      action:    'api_key_generated',
      resource:  'user',
      resourceId: user.id,
      details:   {},
      ipAddress: req.ip ?? 'unknown',
      userAgent: (req.headers['user-agent'] ?? '').slice(0, 200),
      requestId: req.requestId ?? 'unknown',
      outcome:   'success',
    });

    // Return raw key ONCE — never stored in plaintext
    res.status(201).json({
      apiKey:  rawKey,
      message: 'Store this key securely — it will not be shown again.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
