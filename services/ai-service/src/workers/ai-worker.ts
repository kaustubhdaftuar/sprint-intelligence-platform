import { Worker, Job } from 'bullmq';
import { createClient } from 'redis';
import { env } from '../utils/env';
import logger from '../utils/logger';
import { scoreSprintRisk, ScoreSprintRiskInput } from '../jobs/score-sprint-risk';

/**
 * AI Worker - Processes AI jobs from Redis queue.
 * 
 * Job types:
 * - score-sprint-risk
 * - detect-blockers
 * - generate-sprint-plan
 * - suggest-priorities
 * - generate-summary
 */

interface AIJobData {
  type: string;
  payload: unknown;
  correlationId?: string;
}

export async function startWorker() {
  // Connect to Redis
  const redisClient = createClient({ url: env.REDIS_URL });
  
  redisClient.on('error', (err) => {
    logger.error({ err }, 'Redis client error');
  });
  
  await redisClient.connect();
  logger.info('Redis connected for worker');

  // Create BullMQ worker
  const worker = new Worker<AIJobData>(
    env.QUEUE_NAME,
    async (job: Job<AIJobData>) => {
      logger.info(
        {
          jobId: job.id,
          jobType: job.data.type,
          correlationId: job.data.correlationId,
        },
        'Processing AI job'
      );

      try {
        // Route to appropriate handler
        const result = await processJob(job.data);
        
        logger.info(
          {
            jobId: job.id,
            jobType: job.data.type,
            correlationId: job.data.correlationId,
          },
          'Job completed successfully'
        );
        
        return result;
      } catch (error) {
        logger.error(
          {
            jobId: job.id,
            jobType: job.data.type,
            error: (error as Error).message,
            correlationId: job.data.correlationId,
          },
          'Job failed'
        );
        throw error;
      }
    },
    {
      connection: {
        host: new URL(env.REDIS_URL).hostname,
        port: parseInt(new URL(env.REDIS_URL).port || '6379'),
      },
      concurrency: env.CONCURRENCY,
      removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
      removeOnFail: { count: 500 },     // Keep last 500 failed jobs
    }
  );

  // Worker event handlers
  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Job completed event');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        error: err.message,
      },
      'Job failed event'
    );
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Worker error');
  });

  logger.info(
    {
      queueName: env.QUEUE_NAME,
      concurrency: env.CONCURRENCY,
    },
    'AI worker started'
  );

  return worker;
}

/**
 * Route job to appropriate handler based on type.
 */
async function processJob(data: AIJobData): Promise<unknown> {
  switch (data.type) {
    case 'score-sprint-risk':
      return await scoreSprintRisk(data.payload as ScoreSprintRiskInput);
    
    case 'detect-blockers':
      logger.info('detect-blockers job received (not implemented yet)');
      return { message: 'Job type not implemented yet' };
    
    case 'generate-sprint-plan':
      logger.info('generate-sprint-plan job received (not implemented yet)');
      return { message: 'Job type not implemented yet' };
    
    case 'suggest-priorities':
      logger.info('suggest-priorities job received (not implemented yet)');
      return { message: 'Job type not implemented yet' };
    
    case 'generate-summary':
      logger.info('generate-summary job received (not implemented yet)');
      return { message: 'Job type not implemented yet' };
    
    default:
      throw new Error(`Unknown job type: ${data.type}`);
  }
}