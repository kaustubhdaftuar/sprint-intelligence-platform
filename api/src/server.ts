import mongoose from 'mongoose';
import { createClient } from 'redis';
import http from 'http';

import { env } from '@/utils/env';
import logger from '@/utils/logger';
import { createApp } from '@/app';

/**
 * server.ts — process boot sequence only.
 *
 * Responsibilities:
 * 1. Connect to MongoDB
 * 2. Connect to Redis
 * 3. Create the Express app (passing Redis client for /ready check)
 * 4. Start the HTTP server
 * 5. Register graceful shutdown handlers (SIGTERM + SIGINT)
 *
 * Nothing else belongs here.
 *
 * Why separate from app.ts:
 * - app.ts can be imported by tests without triggering DB connections
 * - Startup failures are isolated and logged with context
 * - Graceful shutdown has access to both the HTTP server and DB clients
 *
 * Graceful shutdown sequence (Kubernetes SIGTERM flow):
 * 1. K8s sends SIGTERM to the pod
 * 2. We stop accepting new connections (server.close())
 * 3. We wait for in-flight requests to complete (drain period)
 * 4. We close DB and Redis connections
 * 5. Process exits 0
 *
 * The drain period matters: K8s removes the pod from the Service endpoints
 * before sending SIGTERM, but there's a race — some requests may already
 * be in-flight to this pod. The drain period absorbs that race.
 */

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10_000; // 10 seconds drain period

async function connectMongoDB(): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      // These options prevent connection pool exhaustion under load
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    logger.info({ uri: env.MONGODB_URI.replace(/\/\/.*@/, '//***@') }, 'MongoDB connected');

    mongoose.connection.on('error', (err: Error) => {
      logger.error({ err }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
  } catch (err) {
    logger.error({ err }, 'MongoDB connection failed — exiting');
    process.exit(1);
  }
}

async function connectRedis(): Promise<ReturnType<typeof createClient>> {
  const client = createClient({ url: env.REDIS_URL });

  client.on('error', (err: Error) => {
    logger.error({ err }, 'Redis client error');
  });

  client.on('reconnecting', () => {
    logger.warn('Redis reconnecting');
  });

  try {
    await client.connect();
    logger.info({ url: env.REDIS_URL }, 'Redis connected');
    return client;
  } catch (err) {
    logger.error({ err }, 'Redis connection failed — exiting');
    process.exit(1);
  }
}

function registerShutdownHandlers(
  httpServer: http.Server,
  redisClient: ReturnType<typeof createClient>,
): void {
  /**
   * Graceful shutdown function.
   * Called on both SIGTERM (Kubernetes) and SIGINT (local Ctrl+C).
   */
  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutdown signal received — starting graceful shutdown');

    // Step 1: Stop accepting new connections
    httpServer.close(async () => {
      logger.info('HTTP server closed — no new connections accepted');

      // Step 2: Close DB and cache connections
      try {
        await mongoose.connection.close(false);
        logger.info('MongoDB connection closed');
      } catch (err) {
        logger.error({ err }, 'Error closing MongoDB connection');
      }

      try {
        await redisClient.quit();
        logger.info('Redis connection closed');
      } catch (err) {
        logger.error({ err }, 'Error closing Redis connection');
      }

      logger.info('Graceful shutdown complete');
      process.exit(0);
    });

    // Step 3: Force exit if drain period exceeded
    // This prevents the pod from hanging indefinitely if requests stall
    setTimeout(() => {
      logger.error(
        { timeoutMs: GRACEFUL_SHUTDOWN_TIMEOUT_MS },
        'Graceful shutdown timeout exceeded — forcing exit',
      );
      process.exit(1);
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS).unref(); // .unref() so this timer doesn't
                                               // prevent exit if shutdown completes first
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Handle unhandled promise rejections — log and exit
  // In production, an unhandled rejection should be treated as fatal
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason }, 'Unhandled promise rejection — exiting');
    process.exit(1);
  });

  // Handle uncaught exceptions — log and exit
  process.on('uncaughtException', (err: Error) => {
    logger.error({ err }, 'Uncaught exception — exiting');
    process.exit(1);
  });
}

async function startServer(): Promise<void> {
  // Step 1: Connect to dependencies first
  // If either fails, process.exit(1) is called inside the connect functions
  await connectMongoDB();
  const redisClient = await connectRedis();

  // Step 2: Create Express app with Redis client injected for /ready check
  const app = createApp(redisClient);

  // Step 3: Start HTTP server
  const httpServer = http.createServer(app);

  httpServer.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        apiPrefix: env.API_PREFIX,
      },
      'HTTP server listening',
    );
  });

  // Step 4: Register shutdown handlers with references to both connections
  registerShutdownHandlers(httpServer, redisClient);
}

// Boot
startServer().catch((err: unknown) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});