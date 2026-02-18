"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TicketController = void 0;
const ticket_service_1 = require("../services/ticket.service");
/**
 * TicketController — HTTP in/out only.
 * No business logic. No DB queries. No Mongoose types.
 */
exports.TicketController = {
    create: async (req, res, next) => {
        try {
            const ticket = await ticket_service_1.ticketService.createTicket(req._user.id, req.params.projectId, req.body);
            res.status(201).json({ success: true, data: ticket });
        }
        catch (err) {
            next(err);
        }
    },
    list: async (req, res, next) => {
        try {
            const result = await ticket_service_1.ticketService.listTickets(req._user.id, req.params.projectId, req.query);
            res.status(200).json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    },
    getById: async (req, res, next) => {
        try {
            const ticket = await ticket_service_1.ticketService.getTicket(req._user.id, req.params.id);
            res.status(200).json({ success: true, data: ticket });
        }
        catch (err) {
            next(err);
        }
    },
    update: async (req, res, next) => {
        try {
            const ticket = await ticket_service_1.ticketService.updateTicket(req._user.id, req.params.id, req.body);
            res.status(200).json({ success: true, data: ticket });
        }
        catch (err) {
            next(err);
        }
    },
    transitionStatus: async (req, res, next) => {
        try {
            const ticket = await ticket_service_1.ticketService.transitionStatus(req._user.id, req.params.id, req.body);
            res.status(200).json({ success: true, data: ticket });
        }
        catch (err) {
            next(err);
        }
    },
    addComment: async (req, res, next) => {
        try {
            const ticket = await ticket_service_1.ticketService.addComment(req._user.id, req.params.id, req.body);
            res.status(201).json({ success: true, data: ticket });
        }
        catch (err) {
            next(err);
        }
    },
    delete: async (req, res, next) => {
        try {
            await ticket_service_1.ticketService.deleteTicket(req._user.id, req.user.role, req.params.id);
            res.status(204).send();
        }
        catch (err) {
            next(err);
        }
    },
};
