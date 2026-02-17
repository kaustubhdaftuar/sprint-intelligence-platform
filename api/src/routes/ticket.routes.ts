import { Router } from 'express';
import { TicketController } from '@/controllers/ticket.controller';
import { authenticate } from '@/middleware/auth.middleware';
import { authorize } from '@/middleware/rbac.middleware';
import {
  validateBody,
  validateQuery,
  validateParams,
} from '@/middleware/validation.middleware';
import {
  CreateTicketSchema,
  UpdateTicketSchema,
  TransitionStatusSchema,
  AddCommentSchema,
  ListTicketsQuerySchema,
  TicketIdParamSchema,
  CommentParamSchema,
} from '@/validators/ticket.validators';
import { z } from 'zod';
import { objectIdSchema } from '@/validators/shared.validators';

/**
 * Ticket routes — nested under /projects/:projectId/tickets
 *
 * Mounted in app.ts as:
 *   app.use('/api/v1/projects/:projectId/tickets', ticketRouter)
 *
 * Route decisions:
 * - POST /              : any member (developers create their own tickets)
 * - GET /               : any member
 * - GET /:id            : any member
 * - PATCH /:id          : any member (ownership/role checks in service)
 * - PATCH /:id/status   : any member (state machine in service)
 * - POST /:id/comments  : any member
 * - DELETE /:id         : reporter or manager/admin (checked in service)
 *
 * Why PATCH /status instead of POST /status:
 * Status is a field on an existing resource — PATCH is semantically correct.
 * POST would imply creating a new sub-resource.
 *
 * Why not PUT for updates:
 * PUT implies replacing the full resource. PATCH for partial updates
 * is correct here and matches how clients use it.
 */

const projectIdParamSchema = z.object({ projectId: objectIdSchema });
const ticketWithProjectSchema = z.object({
  projectId: objectIdSchema,
  id: objectIdSchema,
});

const router = Router({ mergeParams: true }); // inherit :projectId from parent

router.post(
  '/',
  authenticate,
  validateParams(projectIdParamSchema),
  validateBody(CreateTicketSchema),
  TicketController.create,
);

router.get(
  '/',
  authenticate,
  validateParams(projectIdParamSchema),
  validateQuery(ListTicketsQuerySchema),
  TicketController.list,
);

router.get(
  '/:id',
  authenticate,
  validateParams(ticketWithProjectSchema),
  TicketController.getById,
);

router.patch(
  '/:id',
  authenticate,
  validateParams(ticketWithProjectSchema),
  validateBody(UpdateTicketSchema),
  TicketController.update,
);

router.patch(
  '/:id/status',
  authenticate,
  validateParams(ticketWithProjectSchema),
  validateBody(TransitionStatusSchema),
  TicketController.transitionStatus,
);

router.post(
  '/:id/comments',
  authenticate,
  validateParams(ticketWithProjectSchema),
  validateBody(AddCommentSchema),
  TicketController.addComment,
);

router.delete(
  '/:id',
  authenticate,
  validateParams(ticketWithProjectSchema),
  TicketController.delete,
);

export default router;