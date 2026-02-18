"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sprintService = exports.SprintService = void 0;
const mongoose_1 = require("mongoose");
const sprint_repository_1 = require("../repositories/sprint.repository");
const project_repository_1 = require("../repositories/project.repository");
const app_errors_1 = require("../errors/app.errors");
const ticket_repository_1 = require("../repositories/ticket.repository");
const logger_1 = __importDefault(require("../utils/logger"));
// Valid state transitions — source of truth for the state machine
const VALID_TRANSITIONS = {
    PLANNING: ['ACTIVE'],
    ACTIVE: ['DONE'],
    DONE: [],
};
class SprintService {
    /**
     * Create a sprint. Only manager/admin can create sprints.
     * Caller must be a member of the project.
     */
    async createSprint(callerId, callerRole, projectId, dto) {
        if (callerRole === 'developer') {
            throw new app_errors_1.ForbiddenError('Developers cannot create sprints');
        }
        await this.assertProjectMembership(callerId, projectId);
        const sprint = await sprint_repository_1.sprintRepository.create({
            projectId: new mongoose_1.Types.ObjectId(projectId),
            name: dto.name,
            goal: dto.goal ?? '',
            startDate: dto.startDate,
            endDate: dto.endDate,
            velocityTarget: dto.velocityTarget,
        });
        logger_1.default.info({ sprintId: sprint._id.toString(), projectId, callerId }, 'Sprint created');
        return sprint;
    }
    /**
     * List sprints for a project. Caller must be a project member.
     */
    async listSprints(callerId, projectId, query) {
        await this.assertProjectMembership(callerId, projectId);
        const pid = new mongoose_1.Types.ObjectId(projectId);
        const skip = (query.page - 1) * query.limit;
        const [sprints, total] = await Promise.all([
            sprint_repository_1.sprintRepository.findByProject(pid, query.status, skip, query.limit),
            sprint_repository_1.sprintRepository.countByProject(pid, query.status),
        ]);
        return {
            sprints,
            total,
            page: query.page,
            limit: query.limit,
            totalPages: Math.ceil(total / query.limit),
        };
    }
    /**
     * Get a single sprint. Caller must be a project member.
     */
    async getSprint(callerId, sprintId) {
        const sprint = await this.findSprintOrThrow(sprintId);
        await this.assertProjectMembership(callerId, sprint.projectId.toString());
        return sprint;
    }
    /**
     * Update sprint metadata (name, goal, dates, velocityTarget).
     * Only allowed in PLANNING status — cannot edit an active or done sprint.
     * Only manager/admin can update.
     */
    async updateSprint(callerId, callerRole, sprintId, dto) {
        if (callerRole === 'developer') {
            throw new app_errors_1.ForbiddenError('Developers cannot update sprints');
        }
        const sprint = await this.findSprintOrThrow(sprintId);
        await this.assertProjectMembership(callerId, sprint.projectId.toString());
        if (sprint.status !== 'PLANNING') {
            throw new app_errors_1.BusinessRuleError(`Sprint cannot be edited in '${sprint.status}' status. Only PLANNING sprints can be modified.`);
        }
        // If updating dates, re-validate the cross-field constraint
        if (dto.startDate || dto.endDate) {
            const newStart = dto.startDate ?? sprint.startDate;
            const newEnd = dto.endDate ?? sprint.endDate;
            if (newEnd <= newStart) {
                throw new app_errors_1.BusinessRuleError('endDate must be after startDate');
            }
        }
        const updated = await sprint_repository_1.sprintRepository.update(new mongoose_1.Types.ObjectId(sprintId), dto);
        if (!updated)
            throw new app_errors_1.NotFoundError('Sprint', sprintId);
        logger_1.default.info({ sprintId, callerId }, 'Sprint updated');
        return updated;
    }
    /**
     * Start a sprint: PLANNING → ACTIVE.
     *
     * Rules:
     * 1. Sprint must currently be PLANNING
     * 2. No other sprint in this project can be ACTIVE
     *    (enforced by partial unique index at DB level + checked here for
     *    a clean error message before hitting the DB constraint)
     * 3. Only manager/admin can start a sprint
     */
    async startSprint(callerId, callerRole, sprintId) {
        if (callerRole === 'developer') {
            throw new app_errors_1.ForbiddenError('Developers cannot start sprints');
        }
        const sprint = await this.findSprintOrThrow(sprintId);
        await this.assertProjectMembership(callerId, sprint.projectId.toString());
        this.assertValidTransition(sprint, 'ACTIVE');
        // Service-layer check for clean error message
        // (DB partial unique index is the hard enforcement)
        const activeSprint = await sprint_repository_1.sprintRepository.findActiveSprint(sprint.projectId);
        if (activeSprint) {
            throw new app_errors_1.ConflictError(`Sprint '${activeSprint.name}' is already active in this project. ` +
                `Complete or cancel it before starting a new sprint.`);
        }
        const updated = await sprint_repository_1.sprintRepository.setStatus(new mongoose_1.Types.ObjectId(sprintId), 'ACTIVE');
        if (!updated)
            throw new app_errors_1.NotFoundError('Sprint', sprintId);
        logger_1.default.info({ sprintId, projectId: sprint.projectId.toString(), callerId }, 'Sprint started');
        return updated;
    }
    /**
     * Complete a sprint: ACTIVE → DONE.
     *
     * On completion:
     * - actualVelocity is computed from DONE tickets' story points
     * - Incomplete tickets remain assigned to the sprint (historical record)
     * - Manager decides what to do with them (move to next sprint — future feature)
     */
    async completeSprint(callerId, callerRole, sprintId) {
        if (callerRole === 'developer') {
            throw new app_errors_1.ForbiddenError('Developers cannot complete sprints');
        }
        const sprint = await this.findSprintOrThrow(sprintId);
        await this.assertProjectMembership(callerId, sprint.projectId.toString());
        this.assertValidTransition(sprint, 'DONE');
        // Compute actual velocity from DONE tickets
        const doneTickets = await ticket_repository_1.ticketRepository.findBySprintAndStatus(new mongoose_1.Types.ObjectId(sprintId), 'DONE');
        const actualVelocity = doneTickets.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
        const updated = await sprint_repository_1.sprintRepository.setStatus(new mongoose_1.Types.ObjectId(sprintId), 'DONE', actualVelocity);
        if (!updated)
            throw new app_errors_1.NotFoundError('Sprint', sprintId);
        logger_1.default.info({ sprintId, actualVelocity, callerId }, 'Sprint completed');
        return updated;
    }
    /**
     * Assign tickets to a sprint (bulk).
     *
     * Rules:
     * 1. Sprint must be PLANNING or ACTIVE (not DONE)
     * 2. All tickets must belong to the same project as the sprint
     * 3. capacityPoints updated atomically after assignment
     */
    async assignTickets(callerId, sprintId, dto) {
        const sprint = await this.findSprintOrThrow(sprintId);
        await this.assertProjectMembership(callerId, sprint.projectId.toString());
        if (sprint.status === 'DONE') {
            throw new app_errors_1.BusinessRuleError('Cannot assign tickets to a completed sprint');
        }
        const ticketObjectIds = dto.ticketIds.map((id) => new mongoose_1.Types.ObjectId(id));
        // Validate all tickets belong to this sprint's project
        const tickets = await ticket_repository_1.ticketRepository.findManyByIds(ticketObjectIds);
        if (tickets.length !== ticketObjectIds.length) {
            throw new app_errors_1.NotFoundError('One or more tickets');
        }
        const wrongProject = tickets.find((t) => t.projectId.toString() !== sprint.projectId.toString());
        if (wrongProject) {
            throw new app_errors_1.BusinessRuleError(`Ticket '${wrongProject._id.toString()}' does not belong to this project`);
        }
        // Assign tickets and compute capacity delta
        const pointsDelta = await ticket_repository_1.ticketRepository.assignToSprint(ticketObjectIds, new mongoose_1.Types.ObjectId(sprintId));
        await sprint_repository_1.sprintRepository.adjustCapacity(new mongoose_1.Types.ObjectId(sprintId), pointsDelta);
        const updated = await sprint_repository_1.sprintRepository.findById(new mongoose_1.Types.ObjectId(sprintId));
        if (!updated)
            throw new app_errors_1.NotFoundError('Sprint', sprintId);
        logger_1.default.info({ sprintId, ticketCount: dto.ticketIds.length, pointsDelta, callerId }, 'Tickets assigned to sprint');
        return updated;
    }
    /**
     * Remove a ticket from a sprint (back to backlog).
     * Decrements capacityPoints by the ticket's story points.
     */
    async removeTicketFromSprint(callerId, sprintId, ticketId) {
        const sprint = await this.findSprintOrThrow(sprintId);
        await this.assertProjectMembership(callerId, sprint.projectId.toString());
        if (sprint.status === 'DONE') {
            throw new app_errors_1.BusinessRuleError('Cannot modify tickets in a completed sprint');
        }
        const pointsDelta = await ticket_repository_1.ticketRepository.removeFromSprint(new mongoose_1.Types.ObjectId(ticketId), new mongoose_1.Types.ObjectId(sprintId));
        await sprint_repository_1.sprintRepository.adjustCapacity(new mongoose_1.Types.ObjectId(sprintId), -pointsDelta);
        const updated = await sprint_repository_1.sprintRepository.findById(new mongoose_1.Types.ObjectId(sprintId));
        if (!updated)
            throw new app_errors_1.NotFoundError('Sprint', sprintId);
        logger_1.default.info({ sprintId, ticketId, pointsDelta, callerId }, 'Ticket removed from sprint');
        return updated;
    }
    // ─── Private helpers ──────────────────────────────────────────────────────
    async findSprintOrThrow(sprintId) {
        let objectId;
        try {
            objectId = new mongoose_1.Types.ObjectId(sprintId);
        }
        catch {
            throw new app_errors_1.NotFoundError('Sprint', sprintId);
        }
        const sprint = await sprint_repository_1.sprintRepository.findById(objectId);
        if (!sprint)
            throw new app_errors_1.NotFoundError('Sprint', sprintId);
        return sprint;
    }
    /**
     * Assert transition is valid according to the state machine.
     * Throws BusinessRuleError with a clear message if not.
     */
    assertValidTransition(sprint, targetStatus) {
        const allowed = VALID_TRANSITIONS[sprint.status];
        if (!allowed.includes(targetStatus)) {
            throw new app_errors_1.BusinessRuleError(`Cannot transition sprint from '${sprint.status}' to '${targetStatus}'. ` +
                `Valid transitions from '${sprint.status}': ${allowed.length ? allowed.join(', ') : 'none (terminal state)'}.`);
        }
    }
    /**
     * Assert the caller is a member of the project.
     * Returns 404 (not 403) for non-members to avoid project enumeration.
     */
    async assertProjectMembership(callerId, projectId) {
        const project = await project_repository_1.projectRepository.findById(new mongoose_1.Types.ObjectId(projectId));
        if (!project)
            throw new app_errors_1.NotFoundError('Project', projectId);
        const isMember = project.memberIds.some((id) => id.toString() === callerId);
        if (!isMember) {
            // 404 not 403 — don't reveal the project exists to non-members
            throw new app_errors_1.NotFoundError('Project', projectId);
        }
    }
}
exports.SprintService = SprintService;
exports.sprintService = new SprintService();
