"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIController = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("redis");
const env_1 = require("../utils/env");
/**
 * AI Controller - Enqueues AI jobs to Redis queue.
 * The AI service picks them up and processes them.
 */
// Create Redis connection for queue
const redisClient = (0, redis_1.createClient)({ url: env_1.env.REDIS_URL });
redisClient.connect().catch(console.error);
// Create BullMQ queue
const aiQueue = new bullmq_1.Queue('ai-jobs', {
    connection: {
        host: new URL(env_1.env.REDIS_URL).hostname,
        port: parseInt(new URL(env_1.env.REDIS_URL).port || '6379'),
    },
});
exports.AIController = {
    /**
     * POST /api/v1/ai/score-sprint-risk
     * Enqueue a job to score sprint risk
     */
    scoreSprintRisk: async (req, res, next) => {
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
        }
        catch (err) {
            next(err);
        }
    },
    /**
     * GET /api/v1/ai/jobs/:jobId
     * Check status of an AI job
     */
    getJobStatus: async (req, res, next) => {
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
        }
        catch (err) {
            next(err);
        }
    },
};
