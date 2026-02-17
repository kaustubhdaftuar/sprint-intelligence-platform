import { Types } from 'mongoose';
import { sprintRepository } from '@/repositories/sprint.repository';
import { projectRepository } from '@/repositories/project.repository';
import { ISprint } from '@/models/sprint.model';
import {
  NotFoundError,
  ForbiddenError,
  BusinessRuleError,
  ConflictError,
} from '@/errors/app.errors';
import type { UserRole } from '@/types/auth.types';
import type { PaginationQuery } from '@/validators/shared.validators';
import type { SprintStatusValue } from '@/models/sprint.model';
import type {
  CreateSprintBody,
  UpdateSprintBody,
  ListSprintsQuery,
  AssignTicketsBody,
} from '@/validators/sprint.validators';
import { ticketRepository } from '@/repositories/ticket.repository';
import logger from '@/utils/logger';

/**
 * SprintService — business rules only.
 *
 * State machine enforced here:
 *   PLANNING → ACTIVE   (start sprint)
 *   ACTIVE   → DONE     (complete sprint)
 *
 * No other transitions are valid. Attempting PLANNING → DONE,
 * DONE → ACTIVE, etc. throws BusinessRuleError.
 *
 * Capacity tracking:
 *   capacityPoints is maintained on the Sprint document.
 *   It is incremented/decremented atomically via repository.$inc
 *   when tickets are assigned or removed.
 *   It is NOT recomputed on every read — that would be an N+1 query.
 */

export interface SprintListResult {
  sprints: ISprint[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Valid state transitions — source of truth for the state machine
const VALID_TRANSITIONS: Record<SprintStatusValue, SprintStatusValue[]> = {
  PLANNING: ['ACTIVE'],
  ACTIVE: ['DONE'],
  DONE: [],
};

export class SprintService {
  /**
   * Create a sprint. Only manager/admin can create sprints.
   * Caller must be a member of the project.
   */
  async createSprint(
    callerId: string,
    callerRole: UserRole,
    projectId: string,
    dto: CreateSprintBody,
  ): Promise<ISprint> {
    if (callerRole === 'developer') {
      throw new ForbiddenError('Developers cannot create sprints');
    }

    await this.assertProjectMembership(callerId, projectId);

    const sprint = await sprintRepository.create({
      projectId: new Types.ObjectId(projectId),
      name: dto.name,
      goal: dto.goal ?? '',
      startDate: dto.startDate,
      endDate: dto.endDate,
      velocityTarget: dto.velocityTarget,
    });

    logger.info(
      { sprintId: sprint._id.toString(), projectId, callerId },
      'Sprint created',
    );

    return sprint;
  }

  /**
   * List sprints for a project. Caller must be a project member.
   */
  async listSprints(
    callerId: string,
    projectId: string,
    query: ListSprintsQuery,
  ): Promise<SprintListResult> {
    await this.assertProjectMembership(callerId, projectId);

    const pid = new Types.ObjectId(projectId);
    const skip = (query.page - 1) * query.limit;

    const [sprints, total] = await Promise.all([
      sprintRepository.findByProject(pid, query.status, skip, query.limit),
      sprintRepository.countByProject(pid, query.status),
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
  async getSprint(callerId: string, sprintId: string): Promise<ISprint> {
    const sprint = await this.findSprintOrThrow(sprintId);
    await this.assertProjectMembership(callerId, sprint.projectId.toString());
    return sprint;
  }

  /**
   * Update sprint metadata (name, goal, dates, velocityTarget).
   * Only allowed in PLANNING status — cannot edit an active or done sprint.
   * Only manager/admin can update.
   */
  async updateSprint(
    callerId: string,
    callerRole: UserRole,
    sprintId: string,
    dto: UpdateSprintBody,
  ): Promise<ISprint> {
    if (callerRole === 'developer') {
      throw new ForbiddenError('Developers cannot update sprints');
    }

    const sprint = await this.findSprintOrThrow(sprintId);
    await this.assertProjectMembership(callerId, sprint.projectId.toString());

    if (sprint.status !== 'PLANNING') {
      throw new BusinessRuleError(
        `Sprint cannot be edited in '${sprint.status}' status. Only PLANNING sprints can be modified.`,
      );
    }

    // If updating dates, re-validate the cross-field constraint
    if (dto.startDate || dto.endDate) {
      const newStart = dto.startDate ?? sprint.startDate;
      const newEnd = dto.endDate ?? sprint.endDate;
      if (newEnd <= newStart) {
        throw new BusinessRuleError('endDate must be after startDate');
      }
    }

    const updated = await sprintRepository.update(new Types.ObjectId(sprintId), dto);
    if (!updated) throw new NotFoundError('Sprint', sprintId);

    logger.info({ sprintId, callerId }, 'Sprint updated');
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
  async startSprint(
    callerId: string,
    callerRole: UserRole,
    sprintId: string,
  ): Promise<ISprint> {
    if (callerRole === 'developer') {
      throw new ForbiddenError('Developers cannot start sprints');
    }

    const sprint = await this.findSprintOrThrow(sprintId);
    await this.assertProjectMembership(callerId, sprint.projectId.toString());
    this.assertValidTransition(sprint, 'ACTIVE');

    // Service-layer check for clean error message
    // (DB partial unique index is the hard enforcement)
    const activeSprint = await sprintRepository.findActiveSprint(sprint.projectId);
    if (activeSprint) {
      throw new ConflictError(
        `Sprint '${activeSprint.name}' is already active in this project. ` +
          `Complete or cancel it before starting a new sprint.`,
      );
    }

    const updated = await sprintRepository.setStatus(
      new Types.ObjectId(sprintId),
      'ACTIVE',
    );
    if (!updated) throw new NotFoundError('Sprint', sprintId);

    logger.info({ sprintId, projectId: sprint.projectId.toString(), callerId }, 'Sprint started');
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
  async completeSprint(
    callerId: string,
    callerRole: UserRole,
    sprintId: string,
  ): Promise<ISprint> {
    if (callerRole === 'developer') {
      throw new ForbiddenError('Developers cannot complete sprints');
    }

    const sprint = await this.findSprintOrThrow(sprintId);
    await this.assertProjectMembership(callerId, sprint.projectId.toString());
    this.assertValidTransition(sprint, 'DONE');

    // Compute actual velocity from DONE tickets
    const doneTickets = await ticketRepository.findBySprintAndStatus(
      new Types.ObjectId(sprintId),
      'DONE',
    );
    const actualVelocity = doneTickets.reduce(
      (sum, t) => sum + (t.storyPoints ?? 0),
      0,
    );

    const updated = await sprintRepository.setStatus(
      new Types.ObjectId(sprintId),
      'DONE',
      actualVelocity,
    );
    if (!updated) throw new NotFoundError('Sprint', sprintId);

    logger.info(
      { sprintId, actualVelocity, callerId },
      'Sprint completed',
    );
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
  async assignTickets(
    callerId: string,
    sprintId: string,
    dto: AssignTicketsBody,
  ): Promise<ISprint> {
    const sprint = await this.findSprintOrThrow(sprintId);
    await this.assertProjectMembership(callerId, sprint.projectId.toString());

    if (sprint.status === 'DONE') {
      throw new BusinessRuleError('Cannot assign tickets to a completed sprint');
    }

    const ticketObjectIds = dto.ticketIds.map((id) => new Types.ObjectId(id));

    // Validate all tickets belong to this sprint's project
    const tickets = await ticketRepository.findManyByIds(ticketObjectIds);

    if (tickets.length !== ticketObjectIds.length) {
      throw new NotFoundError('One or more tickets');
    }

    const wrongProject = tickets.find(
      (t) => t.projectId.toString() !== sprint.projectId.toString(),
    );
    if (wrongProject) {
      throw new BusinessRuleError(
        `Ticket '${wrongProject._id.toString()}' does not belong to this project`,
      );
    }

    // Assign tickets and compute capacity delta
    const pointsDelta = await ticketRepository.assignToSprint(
      ticketObjectIds,
      new Types.ObjectId(sprintId),
    );

    await sprintRepository.adjustCapacity(
      new Types.ObjectId(sprintId),
      pointsDelta,
    );

    const updated = await sprintRepository.findById(new Types.ObjectId(sprintId));
    if (!updated) throw new NotFoundError('Sprint', sprintId);

    logger.info(
      { sprintId, ticketCount: dto.ticketIds.length, pointsDelta, callerId },
      'Tickets assigned to sprint',
    );

    return updated;
  }

  /**
   * Remove a ticket from a sprint (back to backlog).
   * Decrements capacityPoints by the ticket's story points.
   */
  async removeTicketFromSprint(
    callerId: string,
    sprintId: string,
    ticketId: string,
  ): Promise<ISprint> {
    const sprint = await this.findSprintOrThrow(sprintId);
    await this.assertProjectMembership(callerId, sprint.projectId.toString());

    if (sprint.status === 'DONE') {
      throw new BusinessRuleError('Cannot modify tickets in a completed sprint');
    }

    const pointsDelta = await ticketRepository.removeFromSprint(
      new Types.ObjectId(ticketId),
      new Types.ObjectId(sprintId),
    );

    await sprintRepository.adjustCapacity(
      new Types.ObjectId(sprintId),
      -pointsDelta,
    );

    const updated = await sprintRepository.findById(new Types.ObjectId(sprintId));
    if (!updated) throw new NotFoundError('Sprint', sprintId);

    logger.info({ sprintId, ticketId, pointsDelta, callerId }, 'Ticket removed from sprint');
    return updated;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async findSprintOrThrow(sprintId: string): Promise<ISprint> {
    let objectId: Types.ObjectId;
    try {
      objectId = new Types.ObjectId(sprintId);
    } catch {
      throw new NotFoundError('Sprint', sprintId);
    }

    const sprint = await sprintRepository.findById(objectId);
    if (!sprint) throw new NotFoundError('Sprint', sprintId);
    return sprint;
  }

  /**
   * Assert transition is valid according to the state machine.
   * Throws BusinessRuleError with a clear message if not.
   */
  private assertValidTransition(
    sprint: ISprint,
    targetStatus: SprintStatusValue,
  ): void {
    const allowed = VALID_TRANSITIONS[sprint.status];
    if (!allowed.includes(targetStatus)) {
      throw new BusinessRuleError(
        `Cannot transition sprint from '${sprint.status}' to '${targetStatus}'. ` +
          `Valid transitions from '${sprint.status}': ${
            allowed.length ? allowed.join(', ') : 'none (terminal state)'
          }.`,
      );
    }
  }

  /**
   * Assert the caller is a member of the project.
   * Returns 404 (not 403) for non-members to avoid project enumeration.
   */
  private async assertProjectMembership(
    callerId: string,
    projectId: string,
  ): Promise<void> {
    const project = await projectRepository.findById(
      new Types.ObjectId(projectId),
    );

    if (!project) throw new NotFoundError('Project', projectId);

    const isMember = project.memberIds.some(
      (id) => id.toString() === callerId,
    );

    if (!isMember) {
      // 404 not 403 — don't reveal the project exists to non-members
      throw new NotFoundError('Project', projectId);
    }
  }
}

export const sprintService = new SprintService();