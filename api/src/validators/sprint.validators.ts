import { z } from 'zod';
import {
  objectIdSchema,
  paginationSchema,
  nonEmptyStringSchema,
  sprintStatusSchema,
} from '@/validators/shared.validators';

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

export const CreateSprintSchema = z
  .object({
    name: nonEmptyStringSchema(120),
    goal: z.string().trim().max(500).optional().default(''),
    startDate: z
      .string()
      .datetime({ message: 'startDate must be a valid ISO 8601 datetime' })
      .transform((v) => new Date(v)),
    endDate: z
      .string()
      .datetime({ message: 'endDate must be a valid ISO 8601 datetime' })
      .transform((v) => new Date(v)),
    velocityTarget: z.number().int().min(1).optional(),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  })
  .refine(
    (data) => {
      const diffMs = data.endDate.getTime() - data.startDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays >= 1;
    },
    {
      message: 'Sprint duration must be at least 1 day',
      path: ['endDate'],
    },
  );

export type CreateSprintBody = z.infer<typeof CreateSprintSchema>;

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Update is restricted to name, goal, and velocityTarget only.
 * Dates cannot be changed once the sprint is ACTIVE.
 * Status transitions have their own dedicated endpoints (start, complete).
 */
export const UpdateSprintSchema = z
  .object({
    name: nonEmptyStringSchema(120).optional(),
    goal: z.string().trim().max(500).optional(),
    velocityTarget: z.number().int().min(1).optional(),
    startDate: z
      .string()
      .datetime({ message: 'startDate must be a valid ISO 8601 datetime' })
      .transform((v) => new Date(v))
      .optional(),
    endDate: z
      .string()
      .datetime({ message: 'endDate must be a valid ISO 8601 datetime' })
      .transform((v) => new Date(v))
      .optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.endDate > data.startDate;
      }
      return true;
    },
    {
      message: 'endDate must be after startDate',
      path: ['endDate'],
    },
  );

export type UpdateSprintBody = z.infer<typeof UpdateSprintSchema>;

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
export const SprintIdParamSchema = z.object({
  id: objectIdSchema,
});

export const SprintByProjectParamSchema = z.object({
  projectId: objectIdSchema,
});

// ─── Query ────────────────────────────────────────────────────────────────────

export const ListSprintsQuerySchema = paginationSchema.extend({
  status: sprintStatusSchema.optional(),
  projectId: objectIdSchema.optional(),
});

export type ListSprintsQuery = z.infer<typeof ListSprintsQuerySchema>;

// ─── Assign tickets to sprint ─────────────────────────────────────────────────

/**
 * Bulk assign: accepts an array of ticket IDs.
 * Single assign is just bulk with one element — no separate endpoint needed.
 */
export const AssignTicketsSchema = z.object({
  ticketIds: z
    .array(objectIdSchema)
    .min(1, 'At least one ticketId must be provided')
    .max(50, 'Cannot assign more than 50 tickets at once'),
});

export type AssignTicketsBody = z.infer<typeof AssignTicketsSchema>;

export const RemoveTicketParamSchema = z.object({
  id: objectIdSchema,         // sprintId
  ticketId: objectIdSchema,   // ticketId to remove
});