"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ticketService = exports.TicketService = void 0;
const mongoose_1 = require("mongoose");
const ticket_repository_1 = require("../repositories/ticket.repository");
const project_repository_1 = require("../repositories/project.repository");
const sprint_repository_1 = require("../repositories/sprint.repository");
const app_errors_1 = require("../errors/app.errors");
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * TicketService — business rules only.
 *
 * State machine enforced here:
 *   TODO → IN_PROGRESS → REVIEW → DONE
 *
 * Backward transitions are allowed (e.g. REVIEW → IN_PROGRESS)
 * because real teams reopen tickets. Forward skipping is not
 * allowed (e.g. TODO → DONE) to ensure process integrity.
 *
 * isBlocked is NOT a status transition — it's set by the worker
 * service directly via ticketRepository.setBlocked().
 */
// Allowed transitions — key is current status, value is reachable statuses
const VALID_TRANSITIONS = {
    TODO: ['IN_PROGRESS'],
    IN_PROGRESS: ['TODO', 'REVIEW'],
    REVIEW: ['IN_PROGRESS', 'DONE'],
    DONE: ['REVIEW'], // Allow reopening from DONE → REVIEW
};
class TicketService {
    /**
     * Create a ticket. Any authenticated project member can create tickets.
     * New tickets are always created in the backlog (no sprintId).
     * Sprint assignment is a separate operation.
     */
    async createTicket(callerId, projectId, dto) {
        await this.assertProjectMembership(callerId, projectId);
        const pid = new mongoose_1.Types.ObjectId(projectId);
        // Atomic ticket number generation
        const ticketNumber = await ticket_repository_1.ticketRepository.getNextTicketNumber(pid);
        // Build the project key prefix from projectId (last 4 chars, uppercase)
        // In production this would use a stored project.key field.
        // For now we use a deterministic prefix from projectId.
        const keyPrefix = projectId.slice(-4).toUpperCase();
        const key = `${keyPrefix}-${ticketNumber}`;
        const ticket = await ticket_repository_1.ticketRepository.create({
            projectId: pid,
            reporterId: new mongoose_1.Types.ObjectId(callerId),
            ticketNumber,
            key,
            title: dto.title,
            description: dto.description ?? '',
            type: dto.type ?? 'TASK',
            priority: dto.priority ?? 'MEDIUM',
            storyPoints: dto.storyPoints,
            assignedTo: dto.assignedTo ? new mongoose_1.Types.ObjectId(dto.assignedTo) : undefined,
            tags: dto.tags ?? [],
            estimatedHours: dto.estimatedHours,
            dueDate: dto.dueDate,
        });
        logger_1.default.info({ ticketId: ticket._id.toString(), key, projectId, callerId }, 'Ticket created');
        return ticket;
    }
    /**
     * List tickets for a project with optional filters.
     * Caller must be a project member.
     */
    async listTickets(callerId, projectId, query) {
        await this.assertProjectMembership(callerId, projectId);
        const pid = new mongoose_1.Types.ObjectId(projectId);
        const skip = (query.page - 1) * query.limit;
        const filter = {
            projectId: pid,
            sprintId: query.sprintId ? new mongoose_1.Types.ObjectId(query.sprintId) : undefined,
            noSprint: query.backlog === true,
            status: query.status,
            assignedTo: query.assignedTo
                ? new mongoose_1.Types.ObjectId(query.assignedTo)
                : undefined,
            priority: query.priority,
            isBlocked: query.isBlocked,
        };
        const [tickets, total] = await Promise.all([
            ticket_repository_1.ticketRepository.findMany(filter, skip, query.limit),
            ticket_repository_1.ticketRepository.countMany(filter),
        ]);
        return {
            tickets,
            total,
            page: query.page,
            limit: query.limit,
            totalPages: Math.ceil(total / query.limit),
        };
    }
    /**
     * Get a single ticket. Caller must be a project member.
     */
    async getTicket(callerId, ticketId) {
        const ticket = await this.findTicketOrThrow(ticketId);
        await this.assertProjectMembership(callerId, ticket.projectId.toString());
        return ticket;
    }
    /**
     * Update ticket fields (title, description, priority, etc.).
     * Status changes go through transitionStatus instead.
     * Any project member can update tickets.
     */
    async updateTicket(callerId, ticketId, dto) {
        const ticket = await this.findTicketOrThrow(ticketId);
        await this.assertProjectMembership(callerId, ticket.projectId.toString());
        const updated = await ticket_repository_1.ticketRepository.update(new mongoose_1.Types.ObjectId(ticketId), {
            title: dto.title,
            description: dto.description,
            type: dto.type,
            priority: dto.priority,
            storyPoints: dto.storyPoints,
            assignedTo: dto.assignedTo === null
                ? null
                : dto.assignedTo
                    ? new mongoose_1.Types.ObjectId(dto.assignedTo)
                    : undefined,
            tags: dto.tags,
            estimatedHours: dto.estimatedHours,
            actualHours: dto.actualHours,
            dueDate: dto.dueDate,
        });
        if (!updated)
            throw new app_errors_1.NotFoundError('Ticket', ticketId);
        // If storyPoints changed and ticket is in a sprint, adjust sprint capacity
        if (dto.storyPoints !== undefined &&
            ticket.storyPoints !== dto.storyPoints &&
            ticket.sprintId) {
            const delta = (dto.storyPoints ?? 0) - (ticket.storyPoints ?? 0);
            if (delta !== 0) {
                await sprint_repository_1.sprintRepository.adjustCapacity(ticket.sprintId, delta);
            }
        }
        logger_1.default.info({ ticketId, callerId }, 'Ticket updated');
        return updated;
    }
    /**
     * Transition ticket status through the state machine.
     *
     * Rules:
     * - Forward: TODO→IN_PROGRESS, IN_PROGRESS→REVIEW, REVIEW→DONE
     * - Backward: REVIEW→IN_PROGRESS, IN_PROGRESS→TODO, DONE→REVIEW
     * - Skipping (TODO→DONE) is not allowed
     * - When moved to DONE, isBlocked is cleared automatically
     */
    async transitionStatus(callerId, ticketId, dto) {
        const ticket = await this.findTicketOrThrow(ticketId);
        await this.assertProjectMembership(callerId, ticket.projectId.toString());
        if (ticket.status === dto.status) {
            // Idempotent — already in target state, not an error
            return ticket;
        }
        this.assertValidStatusTransition(ticket.status, dto.status);
        // Ticket must be in a sprint to be transitioned
        // (backlog tickets can't be moved to IN_PROGRESS — assign to sprint first)
        if (!ticket.sprintId && dto.status !== 'TODO') {
            throw new app_errors_1.BusinessRuleError('Ticket must be assigned to a sprint before transitioning to IN_PROGRESS or beyond');
        }
        const updated = await ticket_repository_1.ticketRepository.setStatus(new mongoose_1.Types.ObjectId(ticketId), dto.status);
        if (!updated)
            throw new app_errors_1.NotFoundError('Ticket', ticketId);
        // Clear blocked flag when ticket moves to DONE
        if (dto.status === 'DONE' && ticket.isBlocked) {
            await ticket_repository_1.ticketRepository.setBlocked(new mongoose_1.Types.ObjectId(ticketId), false);
        }
        logger_1.default.info({ ticketId, from: ticket.status, to: dto.status, callerId }, 'Ticket status transitioned');
        return updated;
    }
    /**
     * Add a comment to a ticket. Any project member can comment.
     */
    async addComment(callerId, ticketId, dto) {
        const ticket = await this.findTicketOrThrow(ticketId);
        await this.assertProjectMembership(callerId, ticket.projectId.toString());
        const updated = await ticket_repository_1.ticketRepository.addComment(new mongoose_1.Types.ObjectId(ticketId), {
            userId: new mongoose_1.Types.ObjectId(callerId),
            text: dto.text,
        });
        if (!updated)
            throw new app_errors_1.NotFoundError('Ticket', ticketId);
        logger_1.default.info({ ticketId, callerId }, 'Comment added to ticket');
        return updated;
    }
    /**
     * Delete a ticket. Only manager/admin or the reporter can delete.
     * Cannot delete a ticket that's in an active sprint.
     */
    async deleteTicket(callerId, callerRole, ticketId) {
        const ticket = await this.findTicketOrThrow(ticketId);
        await this.assertProjectMembership(callerId, ticket.projectId.toString());
        const isReporter = ticket.reporterId.toString() === callerId;
        const isManagerOrAdmin = callerRole === 'admin' || callerRole === 'manager';
        if (!isReporter && !isManagerOrAdmin) {
            throw new app_errors_1.ForbiddenError('Only the ticket reporter or a manager/admin can delete tickets');
        }
        // Prevent deletion if ticket is in an active sprint
        if (ticket.sprintId) {
            const sprint = await sprint_repository_1.sprintRepository.findById(ticket.sprintId);
            if (sprint?.status === 'ACTIVE') {
                throw new app_errors_1.BusinessRuleError('Cannot delete a ticket that is assigned to an active sprint. ' +
                    'Remove it from the sprint first.');
            }
            // Adjust sprint capacity if ticket had story points
            if (ticket.storyPoints) {
                await sprint_repository_1.sprintRepository.adjustCapacity(ticket.sprintId, -ticket.storyPoints);
            }
        }
        await ticket_repository_1.ticketRepository.delete(new mongoose_1.Types.ObjectId(ticketId));
        logger_1.default.info({ ticketId, callerId }, 'Ticket deleted');
    }
    // ─── Private helpers ────────────────────────────────────────────────────────
    async findTicketOrThrow(ticketId) {
        let objectId;
        try {
            objectId = new mongoose_1.Types.ObjectId(ticketId);
        }
        catch {
            throw new app_errors_1.NotFoundError('Ticket', ticketId);
        }
        const ticket = await ticket_repository_1.ticketRepository.findById(objectId);
        if (!ticket)
            throw new app_errors_1.NotFoundError('Ticket', ticketId);
        return ticket;
    }
    assertValidStatusTransition(current, target) {
        const allowed = VALID_TRANSITIONS[current];
        if (!allowed.includes(target)) {
            throw new app_errors_1.BusinessRuleError(`Cannot transition ticket from '${current}' to '${target}'. ` +
                `Valid transitions from '${current}': ${allowed.join(', ')}.`);
        }
    }
    async assertProjectMembership(callerId, projectId) {
        const project = await project_repository_1.projectRepository.findById(new mongoose_1.Types.ObjectId(projectId));
        if (!project)
            throw new app_errors_1.NotFoundError('Project', projectId);
        const isMember = project.memberIds.some((id) => id.toString() === callerId);
        if (!isMember)
            throw new app_errors_1.NotFoundError('Project', projectId);
    }
}
exports.TicketService = TicketService;
exports.ticketService = new TicketService();
