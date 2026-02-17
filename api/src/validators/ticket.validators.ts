import { z } from 'zod';
import {
  objectIdSchema,
  paginationSchema,
  nonEmptyStringSchema,
  storyPointsSchema,
  ticketStatusSchema,
  ticketPrioritySchema,
} from '@/validators/shared.validators';
import {
  TICKET_TYPE_VALUES,
} from '@/models/ticket.model';

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

const ticketTypeSchema = z.enum(TICKET_TYPE_VALUES);

// ─── Create ───────────────────────────────────────────────────────────────────

export const CreateTicketSchema = z.object({
  title: nonEmptyStringSchema(250),
  description: z.string().trim().max(10000).optional().default(''),
  type: ticketTypeSchema.optional().default('TASK'),
  priority: ticketPrioritySchema.optional().default('MEDIUM'),
  storyPoints: storyPointsSchema.optional(),
  assignedTo: objectIdSchema.optional(),
  tags: z.array(z.string().trim().max(50)).max(10).optional().default([]),
  estimatedHours: z.number().min(0).max(999).optional(),
  dueDate: z
    .string()
    .datetime({ message: 'dueDate must be a valid ISO 8601 datetime' })
    .transform((v) => new Date(v))
    .optional(),
});

export type CreateTicketBody = z.infer<typeof CreateTicketSchema>;

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Update allows changing most fields except projectId, reporterId, key,
 * ticketNumber — those are immutable after creation.
 * Status changes go through the dedicated transition endpoint.
 */
export const UpdateTicketSchema = z
  .object({
    title: nonEmptyStringSchema(250).optional(),
    description: z.string().trim().max(10000).optional(),
    type: ticketTypeSchema.optional(),
    priority: ticketPrioritySchema.optional(),
    storyPoints: storyPointsSchema.optional(),
    assignedTo: objectIdSchema.nullable().optional(), // null = unassign
    tags: z.array(z.string().trim().max(50)).max(10).optional(),
    estimatedHours: z.number().min(0).max(999).optional(),
    actualHours: z.number().min(0).max(999).optional(),
    dueDate: z
      .string()
      .datetime({ message: 'dueDate must be a valid ISO 8601 datetime' })
      .transform((v) => new Date(v))
      .nullable()
      .optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

export type UpdateTicketBody = z.infer<typeof UpdateTicketSchema>;

// ─── Status transition ────────────────────────────────────────────────────────

/**
 * Explicit status transition endpoint: PATCH /tickets/:id/status
 * Separate from the general update — the service applies state machine rules.
 */
export const TransitionStatusSchema = z.object({
  status: ticketStatusSchema,
});

export type TransitionStatusBody = z.infer<typeof TransitionStatusSchema>;

// ─── Add comment ──────────────────────────────────────────────────────────────

export const AddCommentSchema = z.object({
  text: nonEmptyStringSchema(2000),
});

export type AddCommentBody = z.infer<typeof AddCommentSchema>;

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
export const ListTicketsQuerySchema = paginationSchema
  .extend({
    sprintId: objectIdSchema.optional(),
    backlog: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
    status: ticketStatusSchema.optional(),
    assignedTo: objectIdSchema.optional(),
    priority: ticketPrioritySchema.optional(),
    isBlocked: z
      .string()
      .optional()
      .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  })
  .refine(
    (data) => !(data.sprintId && data.backlog),
    {
      message: 'sprintId and backlog=true are mutually exclusive',
      path: ['sprintId'],
    },
  );

export type ListTicketsQuery = z.infer<typeof ListTicketsQuerySchema>;

// ─── Params ───────────────────────────────────────────────────────────────────

export const TicketIdParamSchema = z.object({
  id: objectIdSchema,
});

export const ProjectTicketParamSchema = z.object({
  projectId: objectIdSchema,
});

export const CommentParamSchema = z.object({
  id: objectIdSchema,       // ticketId
  commentId: objectIdSchema,
});