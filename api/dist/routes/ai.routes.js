"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ai_controller_1 = require("../controllers/ai.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const zod_1 = require("zod");
const shared_validators_1 = require("../validators/shared.validators");
const router = (0, express_1.Router)();
// Validation schemas
const ScoreSprintRiskSchema = zod_1.z.object({
    sprintId: shared_validators_1.objectIdSchema,
});
const JobIdParamSchema = zod_1.z.object({
    jobId: zod_1.z.string(),
});
// POST /ai/score-sprint-risk
router.post('/score-sprint-risk', auth_middleware_1.authenticate, (0, validation_middleware_1.validateBody)(ScoreSprintRiskSchema), ai_controller_1.AIController.scoreSprintRisk);
// GET /ai/jobs/:jobId
router.get('/jobs/:jobId', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(JobIdParamSchema), ai_controller_1.AIController.getJobStatus);
exports.default = router;
