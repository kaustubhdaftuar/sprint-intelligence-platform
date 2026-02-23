import { Router } from 'express';
import { ProjectController } from '@/controllers/project.controller';
import { authenticate } from '@/middleware/auth.middleware';
import { authorize } from '@/middleware/rbac.middleware';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '@/middleware/validation.middleware';
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  ProjectQuerySchema,
  ProjectIdParamSchema,
  MemberParamSchema,
  AddMemberSchema,
} from '@/validators/project.validators';

/**
 * Project routes.
 *
 * Middleware chain order matters:
 *   authenticate → validateBody/Params/Query → authorize → controller
 *
 * authenticate always runs first (sets req.user).
 * authorize always runs after authenticate (reads req.user).
 * Validation runs before controller (req.body is clean when controller runs).
 *
 * Route decisions:
 * - POST /          : admin + manager only (developers can't create projects)
 * - GET /           : all authenticated users (member-scoped in service)
 * - GET /:id        : all authenticated users (membership checked in service)
 * - PATCH /:id      : all authenticated (ownership checked in service — 403 if not owner/admin)
 * - DELETE /:id     : all authenticated (ownership checked in service)
 * - POST /:id/members    : all authenticated (ownership checked in service)
 * - DELETE /:id/members/:memberId : all authenticated (ownership checked in service)
 *
 * Why not put authorize() on PATCH/DELETE here?
 * Because a developer who is also the project owner should be able to update
 * their own project. Role alone is insufficient — ownership matters.
 * The service layer performs the combined check (role + ownership).
 */
const router = Router();

router.post(
  '/',
  authenticate,
  validateBody(CreateProjectSchema),
  authorize('admin', 'manager'),
  ProjectController.create,
);

router.get(
  '/',
  authenticate,
  validateQuery(ProjectQuerySchema),
  ProjectController.list,
);

router.get(
  '/:id',
  authenticate,
  validateParams(ProjectIdParamSchema),
  ProjectController.getById,
);

router.patch(
  '/:id',
  authenticate,
  validateParams(ProjectIdParamSchema),
  validateBody(UpdateProjectSchema),
  ProjectController.update,
);

router.delete(
  '/:id',
  authenticate,
  validateParams(ProjectIdParamSchema),
  ProjectController.delete,
);

router.post(
  '/:id/members',
  authenticate,
  validateParams(ProjectIdParamSchema),
  validateBody(AddMemberSchema),
  ProjectController.addMember,
);

router.delete(
  '/:id/members/:memberId',
  authenticate,
  validateParams(MemberParamSchema),
  ProjectController.removeMember,
);

export default router;