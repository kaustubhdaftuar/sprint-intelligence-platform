import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { createClient } from 'redis';
import aiRoutes from '@/routes/ai.routes';

import { env } from '@/utils/env';
import logger from '@/utils/logger';
import { errorHandler, notFoundHandler } from '@/middleware/errorHandler';

// Routes
import authRoutes from '@/routes/auth.routes';
import projectRoutes from '@/routes/project.routes';
import sprintRoutes from '@/routes/sprint.routes';
import ticketRoutes from '@/routes/ticket.routes';

/**
 * createApp() — pure Express application factory.
 *
 * No database connection, no port binding, no process.on() handlers here.
 * This function can be imported and called in tests without any side effects.
 *
 * All environment-dependent config is read from the validated `env` object.
 * No raw process.env access anywhere in this file.
 *
 * @param redisClient — passed in so /ready can check Redis state.
 *   Using dependency injection here rather than importing a global redis
 *   client keeps app.ts testable and avoids circular imports.
 */
export function createApp(
  redisClient?: ReturnType<typeof createClient>,
): Application {
  const app = express();

  // ─── Trust proxy ────────────────────────────────────────────────────────────
  // Required when running behind nginx ingress in Kubernetes.
  // Without this, req.ip returns the proxy IP, breaking rate limiting.
  app.set('trust proxy', 1);



  // ─── Security ───────────────────────────────────────────────────────────────
  app.use(helmet());

  // ─── CORS ───────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: env.NODE_ENV === 'production'
        ? env.CORS_ORIGIN
        : true,           // Allow all origins in dev
      credentials: true,
    }),
  );

  // ─── Compression ────────────────────────────────────────────────────────────
  app.use(compression());

  // ─── Body parsing ───────────────────────────────────────────────────────────
  // 1mb is sufficient for a JSON API — ticket descriptions are not 10MB.
  // Raising this limit increases surface area for DoS attacks.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // ─── Rate limiting ──────────────────────────────────────────────────────────
  // Applied to /api/ prefix only — health and metrics endpoints are exempt.
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests — please slow down',
        },
      });
    },
  });
  app.use(`${env.API_PREFIX}/`, limiter);

  // ─── Correlation ID ─────────────────────────────────────────────────────────
  // Attach a unique ID to every request. Included in all log lines so a
  // single request can be traced across the full log stream in production.
  // Reads from the incoming header if present (e.g. set by the API gateway),
  // otherwise generates a new UUID.
  app.use((req: Request, res: Response, next: NextFunction): void => {
    const correlationId =
      (req.headers[env.CORRELATION_ID_HEADER] as string | undefined) ??
      randomUUID();

    req.correlationId = correlationId;
    res.setHeader(env.CORRELATION_ID_HEADER, correlationId);
    next();
  });

  // ─── Structured request logging ──────────────────────────────────────────────
  // Fields are top-level in the log object — queryable in any log aggregator.
  // Template strings like `${method} ${path}` are NOT used — they can't be
  // filtered or aggregated by field.
  app.use((req: Request, _res: Response, next: NextFunction): void => {
    logger.info({
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    }, 'incoming request');
    next();
  });

  // ─── Health & observability endpoints ───────────────────────────────────────
  // These are outside the API prefix and NOT rate limited.
  // Kubernetes liveness probe hits /health — must always be fast.
  // Kubernetes readiness probe hits /ready — checks dependencies.

  /**
   * Liveness probe — is the process alive?
   * Should NEVER check DB or Redis — if those are down, the pod is still
   * alive and Kubernetes should not restart it (restart won't fix the DB).
   * Only return non-200 if the process itself is in a broken state.
   */
  app.get('/health', (_req: Request, res: Response): void => {
    res.status(200).json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Readiness probe — is the pod ready to receive traffic?
   * Checks both MongoDB and Redis. If either is unavailable, return 503.
   * Kubernetes will stop routing traffic to this pod until it recovers.
   *
   * Structured response: per-dependency status so ops can see which
   * dependency is unhealthy without reading logs.
   */
  app.get('/ready', async (_req: Request, res: Response): Promise<void> => {
    const checks: Record<string, 'ok' | 'error'> = {};
    let allHealthy = true;

    // MongoDB: readyState 1 = connected
    const dbState = mongoose.connection.readyState;
    if (dbState === 1) {
      checks['mongodb'] = 'ok';
    } else {
      checks['mongodb'] = 'error';
      allHealthy = false;
    }

    // Redis: only checked if client was passed in
    if (redisClient) {
      try {
        await redisClient.ping();
        checks['redis'] = 'ok';
      } catch {
        checks['redis'] = 'error';
        allHealthy = false;
      }
    }

    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json({
      status: allHealthy ? 'ready' : 'not ready',
      checks,
    });
  });

  /**
   * Metrics endpoint — basic process metrics for Prometheus scraping.
   * In a full observability setup this would use prom-client.
   * For now it exposes the minimal set needed for K8s dashboards.
   */
  app.get('/metrics', (_req: Request, res: Response): void => {
    res.status(200).json({
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      nodeVersion: process.version,
    });
  });

  // ─── API routes ──────────────────────────────────────────────────────────────
  const api = env.API_PREFIX; // '/api/v1'

  app.use(`${api}/auth`, authRoutes);
  app.use(`${api}/projects`, projectRoutes);
  app.use(`${api}/ai`, aiRoutes);

  // Sprint and ticket routes are nested under /projects/:projectId
  // mergeParams: true on those routers makes :projectId available downstream
  app.use(`${api}/projects/:projectId/sprints`, sprintRoutes);
  app.use(`${api}/projects/:projectId/tickets`, ticketRoutes);

  // ─── Error handling ──────────────────────────────────────────────────────────
  // Order matters: notFoundHandler must come after all routes,
  // errorHandler must be last (4-argument signature).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}