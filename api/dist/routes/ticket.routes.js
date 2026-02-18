"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ticket_controller_1 = require("../controllers/ticket.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const ticket_validators_1 = require("../validators/ticket.validators");
const zod_1 = require("zod");
const shared_validators_1 = require("../validators/shared.validators");
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
const projectIdParamSchema = zod_1.z.object({ projectId: shared_validators_1.objectIdSchema });
const ticketWithProjectSchema = zod_1.z.object({
    projectId: shared_validators_1.objectIdSchema,
    id: shared_validators_1.objectIdSchema,
});
const router = (0, express_1.Router)({ mergeParams: true }); // inherit :projectId from parent
router.post('/', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(projectIdParamSchema), (0, validation_middleware_1.validateBody)(ticket_validators_1.CreateTicketSchema), ticket_controller_1.TicketController.create);
router.get('/', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(projectIdParamSchema), (0, validation_middleware_1.validateQuery)(ticket_validators_1.ListTicketsQuerySchema), ticket_controller_1.TicketController.list);
router.get('/:id', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(ticketWithProjectSchema), ticket_controller_1.TicketController.getById);
router.patch('/:id', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(ticketWithProjectSchema), (0, validation_middleware_1.validateBody)(ticket_validators_1.UpdateTicketSchema), ticket_controller_1.TicketController.update);
router.patch('/:id/status', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(ticketWithProjectSchema), (0, validation_middleware_1.validateBody)(ticket_validators_1.TransitionStatusSchema), ticket_controller_1.TicketController.transitionStatus);
router.post('/:id/comments', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(ticketWithProjectSchema), (0, validation_middleware_1.validateBody)(ticket_validators_1.AddCommentSchema), ticket_controller_1.TicketController.addComment);
router.delete('/:id', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(ticketWithProjectSchema), ticket_controller_1.TicketController.delete);
exports.default = router;
