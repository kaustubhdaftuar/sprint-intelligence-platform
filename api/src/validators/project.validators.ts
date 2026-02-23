import { z } from 'zod';
import { objectIdSchema, nonEmptyStringSchema, paginationSchema } from '@/validators/shared.validators';

/**
 * Project request validators.
 * Types are inferred from schemas — no separate DTO interface needed.
 * These are imported by the controller to type req.body/req.query after validation.
 */

export const CreateProjectSchema = z.object({
  name: nonEmptyStringSchema(120),
  description: z.string().trim().max(500).optional(),
});

export type CreateProjectBody = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  name: nonEmptyStringSchema(120).optional(),
  description: z.string().trim().max(500).optional(),
}).refine(
  (data) => data.name !== undefined || data.description !== undefined,
  { message: 'At least one field (name or description) must be provided' },
);

export type UpdateProjectBody = z.infer<typeof UpdateProjectSchema>;

export const ProjectQuerySchema = paginationSchema;
export type ProjectQuery = z.infer<typeof ProjectQuerySchema>;

export const ProjectIdParamSchema = z.object({
  id: objectIdSchema,
});

export const MemberParamSchema = z.object({
  id: objectIdSchema,           // projectId
  memberId: objectIdSchema,     // userId to add/remove
});

export const AddMemberSchema = z.object({
  memberId: objectIdSchema,
});

export type AddMemberBody = z.infer<typeof AddMemberSchema>;