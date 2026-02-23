"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectController = void 0;
const project_service_1 = require("../services/project.service");
/**
 * ProjectController — HTTP in/out mapping only.
 *
 * Rules:
 * - No business logic
 * - No DB queries
 * - No Mongoose types
 * - Always calls next(err) on async failure
 * - req.body, req.query, req.params are pre-validated by middleware
 * - req.user is guaranteed present (authenticate runs first)
 *
 * All methods are arrow functions to avoid `this` binding issues
 * when Express calls them as callbacks.
 */
exports.ProjectController = {
    create: async (req, res, next) => {
        try {
            const project = await project_service_1.projectService.createProject(req.user.id, req.user.role, req.body);
            res.status(201).json({ success: true, data: project });
        }
        catch (err) {
            next(err);
        }
    },
    list: async (req, res, next) => {
        try {
            const query = req.query;
            const result = await project_service_1.projectService.listProjects(req.user.id, query);
            res.status(200).json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    },
    getById: async (req, res, next) => {
        try {
            const project = await project_service_1.projectService.getProject(req.user.id, req.params.id);
            res.status(200).json({ success: true, data: project });
        }
        catch (err) {
            next(err);
        }
    },
    update: async (req, res, next) => {
        try {
            const project = await project_service_1.projectService.updateProject(req.user.id, req.user.role, req.params.id, req.body);
            res.status(200).json({ success: true, data: project });
        }
        catch (err) {
            next(err);
        }
    },
    delete: async (req, res, next) => {
        try {
            await project_service_1.projectService.deleteProject(req.user.id, req.user.role, req.params.id);
            res.status(204).send();
        }
        catch (err) {
            next(err);
        }
    },
    addMember: async (req, res, next) => {
        try {
            const project = await project_service_1.projectService.addMember(req.user.id, req.user.role, req.params.id, req.body.memberId);
            res.status(200).json({ success: true, data: project });
        }
        catch (err) {
            next(err);
        }
    },
    removeMember: async (req, res, next) => {
        try {
            const project = await project_service_1.projectService.removeMember(req.user.id, req.user.role, req.params.id, req.params.memberId);
            res.status(200).json({ success: true, data: project });
        }
        catch (err) {
            next(err);
        }
    },
};
