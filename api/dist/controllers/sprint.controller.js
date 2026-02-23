"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SprintController = void 0;
const sprint_service_1 = require("../services/sprint.service");
/**
 * SprintController — HTTP in/out only.
 * No business logic. No DB queries. No Mongoose types.
 * All req.body/query/params are pre-validated by middleware.
 */
exports.SprintController = {
    create: async (req, res, next) => {
        try {
            const sprint = await sprint_service_1.sprintService.createSprint(req.user.id, req.user.role, req.params.projectId, req.body);
            res.status(201).json({ success: true, data: sprint });
        }
        catch (err) {
            next(err);
        }
    },
    list: async (req, res, next) => {
        try {
            const result = await sprint_service_1.sprintService.listSprints(req.user.id, req.params.projectId, req.query);
            res.status(200).json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    },
    getById: async (req, res, next) => {
        try {
            const sprint = await sprint_service_1.sprintService.getSprint(req.user.id, req.params.sprintId);
            res.status(200).json({ success: true, data: sprint });
        }
        catch (err) {
            next(err);
        }
    },
    update: async (req, res, next) => {
        try {
            const sprint = await sprint_service_1.sprintService.updateSprint(req.user.id, req.user.role, req.params.sprintId, req.body);
            res.status(200).json({ success: true, data: sprint });
        }
        catch (err) {
            next(err);
        }
    },
    start: async (req, res, next) => {
        try {
            const sprint = await sprint_service_1.sprintService.startSprint(req.user.id, req.user.role, req.params.sprintId);
            res.status(200).json({ success: true, data: sprint });
        }
        catch (err) {
            next(err);
        }
    },
    complete: async (req, res, next) => {
        try {
            const sprint = await sprint_service_1.sprintService.completeSprint(req.user.id, req.user.role, req.params.sprintId);
            res.status(200).json({ success: true, data: sprint });
        }
        catch (err) {
            next(err);
        }
    },
    assignTickets: async (req, res, next) => {
        try {
            const sprint = await sprint_service_1.sprintService.assignTickets(req.user.id, req.params.sprintId, req.body);
            res.status(200).json({ success: true, data: sprint });
        }
        catch (err) {
            next(err);
        }
    },
    removeTicket: async (req, res, next) => {
        try {
            const sprint = await sprint_service_1.sprintService.removeTicketFromSprint(req.user.id, req.params.sprintId, req.params.ticketId);
            res.status(200).json({ success: true, data: sprint });
        }
        catch (err) {
            next(err);
        }
    },
};
