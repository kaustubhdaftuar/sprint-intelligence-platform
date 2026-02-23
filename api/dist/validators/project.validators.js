"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddMemberSchema = exports.MemberParamSchema = exports.ProjectIdParamSchema = exports.ProjectQuerySchema = exports.UpdateProjectSchema = exports.CreateProjectSchema = void 0;
const zod_1 = require("zod");
const shared_validators_1 = require("../validators/shared.validators");
/**
 * Project request validators.
 * Types are inferred from schemas — no separate DTO interface needed.
 * These are imported by the controller to type req.body/req.query after validation.
 */
exports.CreateProjectSchema = zod_1.z.object({
    name: (0, shared_validators_1.nonEmptyStringSchema)(120),
    description: zod_1.z.string().trim().max(500).optional(),
});
exports.UpdateProjectSchema = zod_1.z.object({
    name: (0, shared_validators_1.nonEmptyStringSchema)(120).optional(),
    description: zod_1.z.string().trim().max(500).optional(),
}).refine((data) => data.name !== undefined || data.description !== undefined, { message: 'At least one field (name or description) must be provided' });
exports.ProjectQuerySchema = shared_validators_1.paginationSchema;
exports.ProjectIdParamSchema = zod_1.z.object({
    id: shared_validators_1.objectIdSchema,
});
exports.MemberParamSchema = zod_1.z.object({
    id: shared_validators_1.objectIdSchema, // projectId
    memberId: shared_validators_1.objectIdSchema, // userId to add/remove
});
exports.AddMemberSchema = zod_1.z.object({
    memberId: shared_validators_1.objectIdSchema,
});
