import { Router } from 'express';
import { AIController } from '@/controllers/ai.controller';
import { authenticate } from '@/middleware/auth.middleware';
import { validateBody, validateParams } from '@/middleware/validation.middleware';
import { z } from 'zod';
import { objectIdSchema } from '@/validators/shared.validators';

const router = Router();

// Validation schemas
const ScoreSprintRiskSchema = z.object({
  sprintId: objectIdSchema,
});

const JobIdParamSchema = z.object({
  jobId: z.string(),
});

// POST /ai/score-sprint-risk
router.post(
  '/score-sprint-risk',
  authenticate,
  validateBody(ScoreSprintRiskSchema),
  AIController.scoreSprintRisk
);

// POST /ai/detect-blockers
router.post(
  '/detect-blockers',
  authenticate,
  validateBody(ScoreSprintRiskSchema),
  AIController.detectBlockers
);

// POST /ai/generate-sprint-summary
router.post(
  '/generate-sprint-summary',
  authenticate,
  validateBody(ScoreSprintRiskSchema),
  AIController.generateSprintSummary
);

// GET /ai/jobs/:jobId
router.get(
  '/jobs/:jobId',
  authenticate,
  validateParams(JobIdParamSchema),
  AIController.getJobStatus
);

export default router;