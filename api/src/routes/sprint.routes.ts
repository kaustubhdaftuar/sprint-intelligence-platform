import { Router } from 'express';
import { SprintController } from '@/controllers/sprint.controller';
import { authenticate } from '@/middleware/auth.middleware';
import { authorize } from '@/middleware/rbac.middleware';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '@/middleware/validation.middleware';
import {
  CreateSprintSchema,
  UpdateSprintSchema,
  ListSprintsQuerySchema,
  SprintIdParamSchema,
  AssignTicketsSchema,
  RemoveTicketParamSchema,
} from '@/validators/sprint.validators';
import { z } from 'zod';
import { objectIdSchema } from '@/validators/shared.validators';

/**
 * Sprint routes — nested under /projects/:projectId/sprints
 *
 * Mounted in app.ts as:
 *   app.use('/api/v1/projects/:projectId/sprints', sprintRouter)
 *
 * Route decisions:
 * - POST /           : manager/admin only (developers don't plan sprints)
 * - GET /            : all members (read access is open)
 * - GET /:sprintId   : all members
 * - PATCH /:sprintId : manager/admin only
 * - POST /:sprintId/start    : manager/admin — explicit transition endpoint
 * - POST /:sprintId/complete : manager/admin — explicit transition endpoint
 * - POST /:sprintId/tickets  : all members can assign tickets
 * - DELETE /:sprintId/tickets/:ticketId : all members can remove tickets
 *
 * Why explicit start/complete endpoints instead of PATCH /status:
 * Each transition has distinct business rules (active sprint check,
 * velocity computation). A generic PATCH /status hides that complexity
 * and makes it harder to reason about what each call does.
 */

const projectIdSchema = z.object({ projectId: objectIdSchema });
const sprintAndProjectSchema = z.object({
  projectId: objectIdSchema,
  sprintId: objectIdSchema,
});

const router = Router({ mergeParams: true }); // mergeParams: inherit :projectId from parent

router.post(
  '/',
  authenticate,
  authorize('admin', 'manager'),
  validateParams(projectIdSchema),
  validateBody(CreateSprintSchema),
  SprintController.create,
);

router.get(
  '/',
  authenticate,
  validateParams(projectIdSchema),
  validateQuery(ListSprintsQuerySchema),
  SprintController.list,
);

router.get(
  '/:sprintId',
  authenticate,
  validateParams(sprintAndProjectSchema),
  SprintController.getById,
);

router.patch(
  '/:sprintId',
  authenticate,
  authorize('admin', 'manager'),
  validateParams(sprintAndProjectSchema),
  validateBody(UpdateSprintSchema),
  SprintController.update,
);

router.post(
  '/:sprintId/start',
  authenticate,
  authorize('admin', 'manager'),
  validateParams(sprintAndProjectSchema),
  SprintController.start,
);

router.post(
  '/:sprintId/complete',
  authenticate,
  authorize('admin', 'manager'),
  validateParams(sprintAndProjectSchema),
  SprintController.complete,
);

router.post(
  '/:sprintId/tickets',
  authenticate,
  validateParams(sprintAndProjectSchema),
  validateBody(AssignTicketsSchema),
  SprintController.assignTickets,
);

router.delete(
  '/:sprintId/tickets/:ticketId',
  authenticate,
  validateParams(RemoveTicketParamSchema),
  SprintController.removeTicket,
);

export default router;