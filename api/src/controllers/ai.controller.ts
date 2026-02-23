import { Request, Response, NextFunction } from 'express';
import { Queue } from 'bullmq';
import { createClient } from 'redis';
import { env } from '@/utils/env';

/**
 * AI Controller - Enqueues AI jobs to Redis queue.
 * The AI service picks them up and processes them.
 */

// Create Redis connection for queue
const redisClient = createClient({ url: env.REDIS_URL });
redisClient.connect().catch(console.error);

// Create BullMQ queue
const aiQueue = new Queue('ai-jobs', {
  connection: {
    host: new URL(env.REDIS_URL).hostname,
    port: parseInt(new URL(env.REDIS_URL).port || '6379'),
  },
});

export const AIController = {
  /**
   * POST /api/v1/ai/score-sprint-risk
   * Enqueue a job to score sprint risk
   */
  scoreSprintRisk: async (
    req: Request<{}, {}, { sprintId: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sprintId } = req.body;

      // Enqueue job
      const job = await aiQueue.add('score-sprint-risk', {
        type: 'score-sprint-risk',
        payload: { sprintId },
        correlationId: req.correlationId,
      });

      res.status(202).json({
        success: true,
        data: {
          jobId: job.id,
          status: 'queued',
          message: 'Sprint risk scoring job queued',
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/v1/ai/jobs/:jobId
   * Check status of an AI job
   */
  getJobStatus: async (
    req: Request<{ jobId: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { jobId } = req.params;

      const job = await aiQueue.getJob(jobId);

      if (!job) {
        res.status(404).json({
          success: false,
          error: { message: 'Job not found' },
        });
        return;
      }

      const state = await job.getState();
      const result = job.returnvalue;
      const failedReason = job.failedReason;

      res.status(200).json({
        success: true,
        data: {
          jobId: job.id,
          status: state,
          result: result || null,
          error: failedReason || null,
        },
      });
    } catch (err) {
      next(err);
    }
  },
};