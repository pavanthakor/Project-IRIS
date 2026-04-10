import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { v4 as uuidv4, validate as isUuid } from 'uuid';
import config from './config';
import { NotFoundError, ValidationError } from './errors';
import { verifyAuth } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { createTierRateLimiter } from './middleware/advancedRateLimiter';
import { requestLogger } from './middleware/requestLogger';
import adminRoutes from './routes/admin';
import authRoutes from './routes/auth';
import bulkRoutes from './routes/bulk';
import exportRoutes from './routes/export';
import healthRoutes from './routes/health';
import historyRoutes from './routes/history';
import { queryRoutes } from './routes/query';
import webhookRoutes from './routes/webhooks';

const MAX_HEADER_BYTES = 8 * 1024; // 8 KB

const app = express();

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'none'"],
      scriptSrc:   ["'none'"],
      styleSrc:    ["'none'"],
      imgSrc:      ["'none'"],
      connectSrc:  ["'self'"],
      fontSrc:     ["'none'"],
      objectSrc:   ["'none'"],
      mediaSrc:    ["'none'"],
      frameSrc:    ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy:   { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  dnsPrefetchControl:        { allow: false },
  frameguard:                { action: 'deny' },
  hsts: {
    maxAge:            365 * 24 * 60 * 60, // 1 year
    includeSubDomains: true,
    preload:           true,
  },
  ieNoOpen:           true,
  noSniff:            true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy:     { policy: 'no-referrer' },
  xssFilter:          true,
}));

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = config.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin:         allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
  methods:        ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
  credentials:    true,
  maxAge:         86400,
}));

// Note: null values are preserved in JSON responses (e.g. cachedAt: null for live queries)

// ── Header size guard ────────────────────────────────────────────────────────
// Must come before express.json() so we reject oversized requests early.
app.use((req: Request, res: Response, next: NextFunction) => {
  let total = 0;
  for (const [key, value] of Object.entries(req.headers)) {
    const v = Array.isArray(value) ? value.join(', ') : (value ?? '');
    total += key.length + v.length + 4; // ": " + "\r\n" overhead
    if (total > MAX_HEADER_BYTES) {
      next(new ValidationError('Request headers exceed the 8 KB limit'));
      return;
    }
  }
  next();
});

app.use(express.json({ limit: '1mb' }));

// ── Content-Type guard for mutation methods ──────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    if (!req.is('application/json')) {
      next(new ValidationError('Content-Type must be application/json'));
      return;
    }
  }
  next();
});

// ── Request ID — validate client-supplied UUID or generate a fresh one ───────
app.use((req: Request, res: Response, next: NextFunction) => {
  const clientId = req.header('x-request-id');
  const requestId = clientId && isUuid(clientId) ? clientId : uuidv4();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

// ── Request lifecycle logger — runs after requestId so every log has an ID ───
app.use(requestLogger());

// Public routes
app.use('/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);

// Protected routes — tier-aware sliding-window rate limiter runs after auth
// so req.user is available for tier + userId keying.
const tierLimiter = createTierRateLimiter();
// Bulk must be mounted before the generic /query route to prevent
// Express from attempting to match "/bulk" against the GET /:id handler.
app.use('/api/v1/query/bulk', verifyAuth, tierLimiter, bulkRoutes);
app.use('/api/v1/query',      verifyAuth, tierLimiter, queryRoutes);
app.use('/api/v1/history',    verifyAuth, tierLimiter, historyRoutes);
app.use('/api/v1/export',     verifyAuth, tierLimiter, exportRoutes);
app.use('/api/v1/webhooks',   verifyAuth, tierLimiter, webhookRoutes);
app.use('/api/v1/admin',      adminRoutes);


// 404 Handler for unmatched routes
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
});

// Global error handler (must be last)
app.use(errorHandler);

export default app;