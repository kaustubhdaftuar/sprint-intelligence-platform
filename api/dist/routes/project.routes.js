"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const project_controller_1 = require("../controllers/project.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const rbac_middleware_1 = require("../middleware/rbac.middleware");
const validation_middleware_1 = require("../middleware/validation.middleware");
const project_validators_1 = require("../validators/project.validators");
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
const router = (0, express_1.Router)();
router.post('/', auth_middleware_1.authenticate, (0, validation_middleware_1.validateBody)(project_validators_1.CreateProjectSchema), (0, rbac_middleware_1.authorize)('admin', 'manager'), project_controller_1.ProjectController.create);
router.get('/', auth_middleware_1.authenticate, (0, validation_middleware_1.validateQuery)(project_validators_1.ProjectQuerySchema), project_controller_1.ProjectController.list);
router.get('/:id', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(project_validators_1.ProjectIdParamSchema), project_controller_1.ProjectController.getById);
router.patch('/:id', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(project_validators_1.ProjectIdParamSchema), (0, validation_middleware_1.validateBody)(project_validators_1.UpdateProjectSchema), project_controller_1.ProjectController.update);
router.delete('/:id', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(project_validators_1.ProjectIdParamSchema), project_controller_1.ProjectController.delete);
router.post('/:id/members', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(project_validators_1.ProjectIdParamSchema), (0, validation_middleware_1.validateBody)(project_validators_1.AddMemberSchema), project_controller_1.ProjectController.addMember);
router.delete('/:id/members/:memberId', auth_middleware_1.authenticate, (0, validation_middleware_1.validateParams)(project_validators_1.MemberParamSchema), project_controller_1.ProjectController.removeMember);
exports.default = router;
