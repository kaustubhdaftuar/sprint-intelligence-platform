import { z } from 'zod';
import { Types } from 'mongoose';

/**
 * Validates a MongoDB ObjectId string.
 *
 * Used for route params like :id and :projectId.
 */
export const objectIdSchema = z
  .string()
  .refine((val) => Types.ObjectId.isValid(val), {
    message: 'Invalid ObjectId format',
  });

/**
 * Non-empty trimmed string with configurable max length.
 *
 * Usage:
 *   name: nonEmptyStringSchema(120)
 */
export const nonEmptyStringSchema = (maxLength: number) =>
  z
    .string()
    .trim()
    .min(1, 'Field cannot be empty')
    .max(maxLength, `Must be at most ${maxLength} characters`);

/**
 * Pagination schema.
 *
 * Express parses query params as strings, so we use z.coerce.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

/**
 * Sprint status enum.
 *
 * Must match sprint model + service layer.
 */
export const sprintStatusSchema = z.enum([
  'PLANNING',
  'ACTIVE',
  'DONE',
]);

export type SprintStatusValue = z.infer<typeof sprintStatusSchema>;

/**
 * Ticket status enum.
 *
 * Must match ticket model + service layer.
 */
export const ticketStatusSchema = z.enum([
  'TODO',
  'IN_PROGRESS',
  'REVIEW',
  'DONE',
]);

export type TicketStatusValue = z.infer<typeof ticketStatusSchema>;

/**
 * Ticket priority enum.
 */
export const ticketPrioritySchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

export type TicketPriorityValue = z.infer<typeof ticketPrioritySchema>;

/**
 * Story points schema.
 *
 * Optional, bounded integer.
 */
export const storyPointsSchema = z
  .number()
  .int()
  .min(0, 'Story points must be >= 0')
  .max(100, 'Story points must be <= 100')
  .optional();
