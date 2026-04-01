import { Worker, Job, Queue } from 'bullmq';
import { env } from '../utils/env';
import logger from '../utils/logger';
import { scoreSprintRisk, ScoreSprintRiskInput } from '../jobs/score-sprint-risk';
import { detectBlockers, DetectBlockersPayload } from '../jobs/detect-blockers';
import {
  generateSprintSummary,
  GenerateSprintSummaryPayload,
} from '../jobs/generate-sprint-summary';

/**
 * AI Worker - Processes AI jobs from Redis queue.
 *
 * Job types:
 * - score-sprint-risk
 * - detect-blockers
 * - generate-sprint-summary
 */

interface AIJobData {
  type: string;
  payload: unknown;
  correlationId?: string;
}

const connection = {
  host: new URL(env.REDIS_URL).hostname,
  port: parseInt(new URL(env.REDIS_URL).port || '6379', 10),
};

export async function startWorker(): Promise<{
  shutdown: () => Promise<void>;
}> {
  const queue = new Queue<AIJobData>(env.QUEUE_NAME, { connection });

  const worker = new Worker<AIJobData>(
    env.QUEUE_NAME,
    async (job: Job<AIJobData>) => {
      logger.info(
        {
          jobId: job.id,
          jobType: job.data.type,
          correlationId: job.data.correlationId,
        },
        'Processing AI job',
      );

      try {
        const result = await processJob(job.data);

        logger.info(
          {
            jobId: job.id,
            jobType: job.data.type,
            correlationId: job.data.correlationId,
          },
          'Job completed successfully',
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
          'Job failed',
        );
        throw error;
      }
    },
    {
      connection,
      concurrency: env.CONCURRENCY,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    },
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Job completed event');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      {
        jobId: job?.id,
        error: err.message,
      },
      'Job failed event',
    );
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Worker error');
  });

  const metricsInterval = setInterval(() => {
    void (async () => {
      try {
        await queue.clean(24 * 60 * 60 * 1000, 100, 'completed');
        await queue.clean(7 * 24 * 60 * 60 * 1000, 500, 'failed');
        const counts = await queue.getJobCounts();
        logger.info({ queueMetrics: counts }, 'Queue status');
      } catch (err) {
        logger.error({ err }, 'Queue clean/metrics failed');
      }
    })();
  }, 60_000);

  const shutdown = async (): Promise<void> => {
    clearInterval(metricsInterval);
    await worker.close();
    await queue.close();
  };

  logger.info(
    {
      queueName: env.QUEUE_NAME,
      concurrency: env.CONCURRENCY,
    },
    'AI worker started',
  );

  return { shutdown };
}

async function processJob(data: AIJobData): Promise<unknown> {
  switch (data.type) {
    case 'score-sprint-risk':
      return await scoreSprintRisk(data.payload as ScoreSprintRiskInput);

    case 'detect-blockers':
      return await detectBlockers(data.payload as DetectBlockersPayload);

    case 'generate-sprint-summary':
      return await generateSprintSummary(
        data.payload as GenerateSprintSummaryPayload,
      );

    default:
      throw new Error(`Unknown job type: ${data.type}`);
  }
}
