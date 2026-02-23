import 'dotenv/config';

import mongoose from 'mongoose';
import { env } from './utils/env';
import logger from './utils/logger';
import { startWorker } from './workers/ai-worker';

async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(env.MONGODB_URI);
    logger.info('MongoDB connected');

    // Start worker
    await startWorker();
    
    logger.info({ port: env.PORT }, 'AI Service running');
  } catch (error) {
    logger.error({ error }, 'Failed to start AI service');
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, closing connections');
    await mongoose.connection.close();
    process.exit(0);
  });
}

startServer();