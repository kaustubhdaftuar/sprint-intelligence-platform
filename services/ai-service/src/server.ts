import 'dotenv/config';

import express from 'express';
import mongoose from 'mongoose';
import { env } from './utils/env';
import logger from './utils/logger';
import { startWorker } from './workers/ai-worker';

async function main(): Promise<void> {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  await mongoose.connect(env.MONGODB_URI);
  logger.info('MongoDB connected');

  const { shutdown: shutdownWorker } = await startWorker();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'AI Service running');
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutdown signal received');
    server.close(() => logger.info('HTTP server closed'));
    try {
      await shutdownWorker();
    } catch (err) {
      logger.error({ err }, 'Worker shutdown error');
    }
    await mongoose.connection.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error({ error }, 'Failed to start AI service');
  process.exit(1);
});
