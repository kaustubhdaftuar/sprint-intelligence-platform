"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storyPointsSchema = exports.ticketPrioritySchema = exports.ticketStatusSchema = exports.sprintStatusSchema = exports.paginationSchema = exports.nonEmptyStringSchema = exports.objectIdSchema = void 0;
const zod_1 = require("zod");
const mongoose_1 = require("mongoose");
/**
 * Validates a MongoDB ObjectId string.
 *
 * Used for route params like :id and :projectId.
 */
exports.objectIdSchema = zod_1.z
    .string()
    .refine((val) => mongoose_1.Types.ObjectId.isValid(val), {
    message: 'Invalid ObjectId format',
});
/**
 * Non-empty trimmed string with configurable max length.
 *
 * Usage:
 *   name: nonEmptyStringSchema(120)
 */
const nonEmptyStringSchema = (maxLength) => zod_1.z
    .string()
    .trim()
    .min(1, 'Field cannot be empty')
    .max(maxLength, `Must be at most ${maxLength} characters`);
exports.nonEmptyStringSchema = nonEmptyStringSchema;
/**
 * Pagination schema.
 *
 * Express parses query params as strings, so we use z.coerce.
 */
exports.paginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
});
/**
 * Sprint status enum.
 *
 * Must match sprint model + service layer.
 */
exports.sprintStatusSchema = zod_1.z.enum([
    'PLANNING',
    'ACTIVE',
    'DONE',
]);
/**
 * Ticket status enum.
 *
 * Must match ticket model + service layer.
 */
exports.ticketStatusSchema = zod_1.z.enum([
    'TODO',
    'IN_PROGRESS',
    'REVIEW',
    'DONE',
]);
/**
 * Ticket priority enum.
 */
exports.ticketPrioritySchema = zod_1.z.enum([
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL',
]);
/**
 * Story points schema.
 *
 * Optional, bounded integer.
 */
exports.storyPointsSchema = zod_1.z
    .number()
    .int()
    .min(0, 'Story points must be >= 0')
    .max(100, 'Story points must be <= 100')
    .optional();
