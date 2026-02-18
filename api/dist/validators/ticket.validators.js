"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentParamSchema = exports.ProjectTicketParamSchema = exports.TicketIdParamSchema = exports.ListTicketsQuerySchema = exports.AddCommentSchema = exports.TransitionStatusSchema = exports.UpdateTicketSchema = exports.CreateTicketSchema = void 0;
const zod_1 = require("zod");
const shared_validators_1 = require("../validators/shared.validators");
const ticket_model_1 = require("../models/ticket.model");
/**
 * Ticket request validators.
 *
 * Key design decisions:
 *
 * 1. BACKLOG is not a status — it's the absence of sprintId.
 *    List query uses ?backlog=true or ?sprintId=xxx to scope results.
 *
 * 2. BLOCKED is not a status — it's the isBlocked flag.
 *    Status transitions only cover: TODO → IN_PROGRESS → REVIEW → DONE
 *
 * 3. Status transitions are validated at the service layer (state machine).
 *    The validator only checks the value is a known status string.
 *
 * 4. storyPoints uses the shared Fibonacci validator — same constraint
 *    as the model's enum, enforced at API boundary before DB write.
 */
const ticketTypeSchema = zod_1.z.enum(ticket_model_1.TICKET_TYPE_VALUES);
// ─── Create ───────────────────────────────────────────────────────────────────
exports.CreateTicketSchema = zod_1.z.object({
    title: (0, shared_validators_1.nonEmptyStringSchema)(250),
    description: zod_1.z.string().trim().max(10000).optional().default(''),
    type: ticketTypeSchema.optional().default('TASK'),
    priority: shared_validators_1.ticketPrioritySchema.optional().default('MEDIUM'),
    storyPoints: shared_validators_1.storyPointsSchema.optional(),
    assignedTo: shared_validators_1.objectIdSchema.optional(),
    tags: zod_1.z.array(zod_1.z.string().trim().max(50)).max(10).optional().default([]),
    estimatedHours: zod_1.z.number().min(0).max(999).optional(),
    dueDate: zod_1.z
        .string()
        .datetime({ message: 'dueDate must be a valid ISO 8601 datetime' })
        .transform((v) => new Date(v))
        .optional(),
});
// ─── Update ───────────────────────────────────────────────────────────────────
/**
 * Update allows changing most fields except projectId, reporterId, key,
 * ticketNumber — those are immutable after creation.
 * Status changes go through the dedicated transition endpoint.
 */
exports.UpdateTicketSchema = zod_1.z
    .object({
    title: (0, shared_validators_1.nonEmptyStringSchema)(250).optional(),
    description: zod_1.z.string().trim().max(10000).optional(),
    type: ticketTypeSchema.optional(),
    priority: shared_validators_1.ticketPrioritySchema.optional(),
    storyPoints: shared_validators_1.storyPointsSchema.optional(),
    assignedTo: shared_validators_1.objectIdSchema.nullable().optional(), // null = unassign
    tags: zod_1.z.array(zod_1.z.string().trim().max(50)).max(10).optional(),
    estimatedHours: zod_1.z.number().min(0).max(999).optional(),
    actualHours: zod_1.z.number().min(0).max(999).optional(),
    dueDate: zod_1.z
        .string()
        .datetime({ message: 'dueDate must be a valid ISO 8601 datetime' })
        .transform((v) => new Date(v))
        .nullable()
        .optional(),
})
    .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
});
// ─── Status transition ────────────────────────────────────────────────────────
/**
 * Explicit status transition endpoint: PATCH /tickets/:id/status
 * Separate from the general update — the service applies state machine rules.
 */
exports.TransitionStatusSchema = zod_1.z.object({
    status: shared_validators_1.ticketStatusSchema,
});
// ─── Add comment ──────────────────────────────────────────────────────────────
exports.AddCommentSchema = zod_1.z.object({
    text: (0, shared_validators_1.nonEmptyStringSchema)(2000),
});
// ─── Query / list ─────────────────────────────────────────────────────────────
/**
 * List tickets query.
 *
 * Scope options (mutually exclusive — validated via refine):
 *   ?sprintId=xxx     → tickets assigned to that sprint
 *   ?backlog=true     → tickets with no sprint (backlog)
 *   (neither)         → all tickets in the project
 *
 * Filters:
 *   ?status=IN_PROGRESS
 *   ?assignedTo=userId
 *   ?priority=HIGH
 */
exports.ListTicketsQuerySchema = shared_validators_1.paginationSchema
    .extend({
    sprintId: shared_validators_1.objectIdSchema.optional(),
    backlog: zod_1.z
        .string()
        .optional()
        .transform((v) => v === 'true'),
    status: shared_validators_1.ticketStatusSchema.optional(),
    assignedTo: shared_validators_1.objectIdSchema.optional(),
    priority: shared_validators_1.ticketPrioritySchema.optional(),
    isBlocked: zod_1.z
        .string()
        .optional()
        .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
})
    .refine((data) => !(data.sprintId && data.backlog), {
    message: 'sprintId and backlog=true are mutually exclusive',
    path: ['sprintId'],
});
// ─── Params ───────────────────────────────────────────────────────────────────
exports.TicketIdParamSchema = zod_1.z.object({
    id: shared_validators_1.objectIdSchema,
});
exports.ProjectTicketParamSchema = zod_1.z.object({
    projectId: shared_validators_1.objectIdSchema,
});
exports.CommentParamSchema = zod_1.z.object({
    id: shared_validators_1.objectIdSchema, // ticketId
    commentId: shared_validators_1.objectIdSchema,
});
