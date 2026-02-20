import 'dotenv/config';

import mongoose from 'mongoose';
import { env } from '@/utils/env';
import logger from '@/utils/logger';

//import { startWorker } from '@/workers/ai-worker';

async function startServer() {
  try {
    // Connect to MongoDB
    await mongoose.connect(env.MONGODB_URI);
    logger.info('MongoDB connected');

    // Start worker
    //await startWorker();
    
    logger.info('AI Service running');
  } catch (error) {
    logger.error({ error }, 'Failed to start AI service');
    process.exit(1);
  }
}

console.log("ENV MONGO:", process.env.MONGODB_URI);

startServer();