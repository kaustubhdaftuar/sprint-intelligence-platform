"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemoveTicketParamSchema = exports.AssignTicketsSchema = exports.ListSprintsQuerySchema = exports.SprintByProjectParamSchema = exports.SprintIdParamSchema = exports.UpdateSprintSchema = exports.CreateSprintSchema = void 0;
const zod_1 = require("zod");
const shared_validators_1 = require("../validators/shared.validators");
/**
 * Sprint request validators.
 *
 * Status values must match sprint.model.ts SPRINT_STATUS_VALUES exactly:
 * 'PLANNING' | 'ACTIVE' | 'DONE'
 *
 * Date rules:
 * - startDate: any valid ISO datetime (not forced future — managers may
 *   backfill sprints for historical tracking)
 * - endDate: must be after startDate — enforced at schema level via .refine()
 * - Sprint duration implied minimum: 1 day
 * - Sprint duration implied maximum: not enforced at API — teams may run
 *   non-standard sprints; let the manager decide
 */
// ─── Create ───────────────────────────────────────────────────────────────────
exports.CreateSprintSchema = zod_1.z
    .object({
    name: (0, shared_validators_1.nonEmptyStringSchema)(120),
    goal: zod_1.z.string().trim().max(500).optional().default(''),
    startDate: zod_1.z
        .string()
        .datetime({ message: 'startDate must be a valid ISO 8601 datetime' })
        .transform((v) => new Date(v)),
    endDate: zod_1.z
        .string()
        .datetime({ message: 'endDate must be a valid ISO 8601 datetime' })
        .transform((v) => new Date(v)),
    velocityTarget: zod_1.z.number().int().min(1).optional(),
})
    .refine((data) => data.endDate > data.startDate, {
    message: 'endDate must be after startDate',
    path: ['endDate'],
})
    .refine((data) => {
    const diffMs = data.endDate.getTime() - data.startDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= 1;
}, {
    message: 'Sprint duration must be at least 1 day',
    path: ['endDate'],
});
// ─── Update ───────────────────────────────────────────────────────────────────
/**
 * Update is restricted to name, goal, and velocityTarget only.
 * Dates cannot be changed once the sprint is ACTIVE.
 * Status transitions have their own dedicated endpoints (start, complete).
 */
exports.UpdateSprintSchema = zod_1.z
    .object({
    name: (0, shared_validators_1.nonEmptyStringSchema)(120).optional(),
    goal: zod_1.z.string().trim().max(500).optional(),
    velocityTarget: zod_1.z.number().int().min(1).optional(),
    startDate: zod_1.z
        .string()
        .datetime({ message: 'startDate must be a valid ISO 8601 datetime' })
        .transform((v) => new Date(v))
        .optional(),
    endDate: zod_1.z
        .string()
        .datetime({ message: 'endDate must be a valid ISO 8601 datetime' })
        .transform((v) => new Date(v))
        .optional(),
})
    .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
})
    .refine((data) => {
    if (data.startDate && data.endDate) {
        return data.endDate > data.startDate;
    }
    return true;
}, {
    message: 'endDate must be after startDate',
    path: ['endDate'],
});
// ─── Status transitions ───────────────────────────────────────────────────────
/**
 * Explicit transition endpoints are cleaner than a generic PATCH /status.
 * Each transition has its own business rules — a generic endpoint hides that.
 *
 * POST /sprints/:id/start    → PLANNING → ACTIVE
 * POST /sprints/:id/complete → ACTIVE → DONE
 *
 * No request body needed for transitions — the action is in the URL.
 * These schemas are for param validation only.
 */
exports.SprintIdParamSchema = zod_1.z.object({
    id: shared_validators_1.objectIdSchema,
});
exports.SprintByProjectParamSchema = zod_1.z.object({
    projectId: shared_validators_1.objectIdSchema,
});
// ─── Query ────────────────────────────────────────────────────────────────────
exports.ListSprintsQuerySchema = shared_validators_1.paginationSchema.extend({
    status: shared_validators_1.sprintStatusSchema.optional(),
    projectId: shared_validators_1.objectIdSchema.optional(),
});
// ─── Assign tickets to sprint ─────────────────────────────────────────────────
/**
 * Bulk assign: accepts an array of ticket IDs.
 * Single assign is just bulk with one element — no separate endpoint needed.
 */
exports.AssignTicketsSchema = zod_1.z.object({
    ticketIds: zod_1.z
        .array(shared_validators_1.objectIdSchema)
        .min(1, 'At least one ticketId must be provided')
        .max(50, 'Cannot assign more than 50 tickets at once'),
});
exports.RemoveTicketParamSchema = zod_1.z.object({
    id: shared_validators_1.objectIdSchema, // sprintId
    ticketId: shared_validators_1.objectIdSchema, // ticketId to remove
});
