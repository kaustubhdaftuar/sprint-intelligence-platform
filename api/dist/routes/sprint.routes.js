"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sprint_controller_1 = require("../controllers/sprint.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rbac_middleware_1 = require("../middleware/rbac.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const sprint_validators_1 = require("../validators/sprint.validators");
const zod_1 = require("zod");
const shared_validators_1 = require("../validators/shared.validators");
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
const projectIdSchema = zod_1.z.object({ projectId: shared_validators_1.objectIdSchema });
const sprintAndProjectSchema = zod_1.z.object({
    projectId: shared_validators_1.objectIdSchema,
    sprintId: shared_validators_1.objectIdSchema,
});
const router = (0, express_1.Router)({ mergeParams: true }); // mergeParams: inherit :projectId from parent
router.post('/', auth_middleware_1.authenticate, (0, rbac_middleware_1.authorize)('admin', 'manager'), (0, validation_middleware_1.validateParams)(projectIdSchema), (0, validation_middleware_1.validateBody)(sprint_validators_1.CreateSprintSchema), sprint_controller_1.SprintController.create);
router.get('/', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(projectIdSchema), (0, validation_middleware_1.validateQuery)(sprint_validators_1.ListSprintsQuerySchema), sprint_controller_1.SprintController.list);
router.get('/:sprintId', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(sprintAndProjectSchema), sprint_controller_1.SprintController.getById);
router.patch('/:sprintId', auth_middleware_1.authenticate, (0, rbac_middleware_1.authorize)('admin', 'manager'), (0, validation_middleware_1.validateParams)(sprintAndProjectSchema), (0, validation_middleware_1.validateBody)(sprint_validators_1.UpdateSprintSchema), sprint_controller_1.SprintController.update);
router.post('/:sprintId/start', auth_middleware_1.authenticate, (0, rbac_middleware_1.authorize)('admin', 'manager'), (0, validation_middleware_1.validateParams)(sprintAndProjectSchema), sprint_controller_1.SprintController.start);
router.post('/:sprintId/complete', auth_middleware_1.authenticate, (0, rbac_middleware_1.authorize)('admin', 'manager'), (0, validation_middleware_1.validateParams)(sprintAndProjectSchema), sprint_controller_1.SprintController.complete);
router.post('/:sprintId/tickets', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(sprintAndProjectSchema), (0, validation_middleware_1.validateBody)(sprint_validators_1.AssignTicketsSchema), sprint_controller_1.SprintController.assignTickets);
router.delete('/:sprintId/tickets/:ticketId', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(sprint_validators_1.RemoveTicketParamSchema), sprint_controller_1.SprintController.removeTicket);
exports.default = router;
