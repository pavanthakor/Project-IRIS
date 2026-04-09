import { Request, Response, NextFunction } from 'express';
import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore, { type RedisReply } from 'rate-limit-redis';
import { ensureRedisConnection, redisClient } from '../config/database';
import logger from '../utils/logger';

const WINDOW_MS = 60 * 1000;

const getTierLimit = (tier: string | undefined) => {
  switch (tier) {
    case 'pro':
      return 100;
    case 'free':
      return 20;
    default:
      return 5;
  }
};

const keyGenerator = (req: Request): string => {
  if (req.user?.id) {
    return req.user.id;
  }
  return req.ip || 'unknown-ip';
};

const setRetryAfterHeader = (
  req: Request,
  res: Response,
  windowMs: number
): void => {
  const resetTime = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit
    ?.resetTime;

  const retryAfterSeconds =
    resetTime instanceof Date
      ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
      : Math.max(1, Math.ceil(windowMs / 1000));

  res.setHeader('Retry-After', String(retryAfterSeconds));
};

const handleLimitExceeded = (
  req: Request,
  res: Response,
  statusCode: number,
  windowMs: number
): void => {
  setRetryAfterHeader(req, res, windowMs);

  logger.warn('Rate limit exceeded', {
    ip: req.ip,
    userId: req.user?.id,
    tier: req.user?.tier,
  });

  res.status(statusCode).json({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
      requestId: req.requestId,
    },
  });
};

// Rate limiters are created eagerly at module load time.
// The Redis-backed limiter uses `skip` to fall back gracefully when Redis is
// not yet connected; the in-memory limiter is used only when Redis is
// unavailable after a connection attempt.

const redisStore = new RedisStore({
  sendCommand: (...args: string[]) => {
    const command = args[0];
    if (command) {
      return redisClient.call(command, ...args.slice(1)) as unknown as Promise<RedisReply>;
    }
    return Promise.reject(new Error('Empty command'));
  },
});

const redisRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: WINDOW_MS,
  limit: (req: Request) => getTierLimit(req.user?.tier),
  keyGenerator,
  store: redisStore,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    handleLimitExceeded(
      req,
      res,
      options.statusCode,
      typeof options.windowMs === 'number' ? options.windowMs : WINDOW_MS
    );
  },
  skip: () => redisClient.status !== 'ready',
});

const fallbackRateLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: WINDOW_MS,
  limit: (req: Request) => getTierLimit(req.user?.tier),
  keyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    handleLimitExceeded(
      req,
      res,
      options.statusCode,
      typeof options.windowMs === 'number' ? options.windowMs : WINDOW_MS
    );
  },
});

export const rateLimiter = async (req: Request, res: Response, next: NextFunction) => {
  if (redisClient.status !== 'ready') {
    try {
      await ensureRedisConnection();
    } catch {
      logger.warn('Redis not available for rate limiting, using in-memory store.');
      return fallbackRateLimiter(req, res, next);
    }
  }

  return redisRateLimiter(req, res, next);
};


