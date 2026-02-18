import { Types } from 'mongoose';
import { ticketRepository } from '@/repositories/ticket.repository';
import { projectRepository } from '@/repositories/project.repository';
import { sprintRepository } from '@/repositories/sprint.repository';
import { ITicket } from '@/models/ticket.model';
import type { TicketStatusValue } from '@/models/ticket.model';
import {
  NotFoundError,
  ForbiddenError,
  BusinessRuleError,
} from '@/errors/app.errors';
import type { UserRole } from '@/types/auth.types';
import type {
  CreateTicketBody,
  UpdateTicketBody,
  TransitionStatusBody,
  AddCommentBody,
  ListTicketsQuery,
} from '@/validators/ticket.validators';
import logger from '@/utils/logger';

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
const VALID_TRANSITIONS: Record<TicketStatusValue, TicketStatusValue[]> = {
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['TODO', 'REVIEW'],
  REVIEW: ['IN_PROGRESS', 'DONE'],
  DONE: ['REVIEW'],             // Allow reopening from DONE → REVIEW
};

export interface TicketListResult {
  tickets: ITicket[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class TicketService {
  /**
   * Create a ticket. Any authenticated project member can create tickets.
   * New tickets are always created in the backlog (no sprintId).
   * Sprint assignment is a separate operation.
   */
  async createTicket(
    callerId: string,
    projectId: string,
    dto: CreateTicketBody,
  ): Promise<ITicket> {
    await this.assertProjectMembership(callerId, projectId);

    const pid = new Types.ObjectId(projectId);

    // Atomic ticket number generation
    const ticketNumber = await ticketRepository.getNextTicketNumber(pid);

    // Build the project key prefix from projectId (last 4 chars, uppercase)
    // In production this would use a stored project.key field.
    // For now we use a deterministic prefix from projectId.
    const keyPrefix = projectId.slice(-4).toUpperCase();
    const key = `${keyPrefix}-${ticketNumber}`;

    const ticket = await ticketRepository.create({
      projectId: pid,
      reporterId: new Types.ObjectId(callerId),
      ticketNumber,
      key,
      title: dto.title,
      description: dto.description ?? '',
      type: dto.type ?? 'TASK',
      priority: dto.priority ?? 'MEDIUM',
      storyPoints: dto.storyPoints,
      assignedTo: dto.assignedTo ? new Types.ObjectId(dto.assignedTo) : undefined,
      tags: dto.tags ?? [],
      estimatedHours: dto.estimatedHours,
      dueDate: dto.dueDate,
    });

    logger.info(
      { ticketId: ticket._id.toString(), key, projectId, callerId },
      'Ticket created',
    );

    return ticket;
  }

  /**
   * List tickets for a project with optional filters.
   * Caller must be a project member.
   */
  async listTickets(
    callerId: string,
    projectId: string,
    query: ListTicketsQuery,
  ): Promise<TicketListResult> {
    await this.assertProjectMembership(callerId, projectId);

    const pid = new Types.ObjectId(projectId);
    const skip = (query.page - 1) * query.limit;

    const filter = {
      projectId: pid,
      sprintId: query.sprintId ? new Types.ObjectId(query.sprintId) : undefined,
      noSprint: query.backlog === true,
      status: query.status,
      assignedTo: query.assignedTo
        ? new Types.ObjectId(query.assignedTo)
        : undefined,
      priority: query.priority,
      isBlocked: query.isBlocked,
    };

    const [tickets, total] = await Promise.all([
      ticketRepository.findMany(filter, skip, query.limit),
      ticketRepository.countMany(filter),
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
  async getTicket(callerId: string, ticketId: string): Promise<ITicket> {
    const ticket = await this.findTicketOrThrow(ticketId);
    await this.assertProjectMembership(callerId, ticket.projectId.toString());
    return ticket;
  }

  /**
   * Update ticket fields (title, description, priority, etc.).
   * Status changes go through transitionStatus instead.
   * Any project member can update tickets.
   */
  async updateTicket(
    callerId: string,
    ticketId: string,
    dto: UpdateTicketBody,
  ): Promise<ITicket> {
    const ticket = await this.findTicketOrThrow(ticketId);
    await this.assertProjectMembership(callerId, ticket.projectId.toString());

    const updated = await ticketRepository.update(new Types.ObjectId(ticketId), {
      title: dto.title,
      description: dto.description,
      type: dto.type,
      priority: dto.priority,
      storyPoints: dto.storyPoints,
      assignedTo: dto.assignedTo === null
        ? null
        : dto.assignedTo
         ? new Types.ObjectId(dto.assignedTo)
         : undefined,
      tags: dto.tags,
      estimatedHours: dto.estimatedHours,
      actualHours: dto.actualHours,
      dueDate: dto.dueDate,
    });

    if (!updated) throw new NotFoundError('Ticket', ticketId);

    // If storyPoints changed and ticket is in a sprint, adjust sprint capacity
    if (
      dto.storyPoints !== undefined &&
      ticket.storyPoints !== dto.storyPoints &&
      ticket.sprintId
    ) {
      const delta = (dto.storyPoints ?? 0) - (ticket.storyPoints ?? 0);
      if (delta !== 0) {
        await sprintRepository.adjustCapacity(ticket.sprintId, delta);
      }
    }

    logger.info({ ticketId, callerId }, 'Ticket updated');
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
  async transitionStatus(
    callerId: string,
    ticketId: string,
    dto: TransitionStatusBody,
  ): Promise<ITicket> {
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
      throw new BusinessRuleError(
        'Ticket must be assigned to a sprint before transitioning to IN_PROGRESS or beyond',
      );
    }

    const updated = await ticketRepository.setStatus(
      new Types.ObjectId(ticketId),
      dto.status,
    );
    if (!updated) throw new NotFoundError('Ticket', ticketId);

    // Clear blocked flag when ticket moves to DONE
    if (dto.status === 'DONE' && ticket.isBlocked) {
      await ticketRepository.setBlocked(new Types.ObjectId(ticketId), false);
    }

    logger.info(
      { ticketId, from: ticket.status, to: dto.status, callerId },
      'Ticket status transitioned',
    );

    return updated;
  }

  /**
   * Add a comment to a ticket. Any project member can comment.
   */
  async addComment(
    callerId: string,
    ticketId: string,
    dto: AddCommentBody,
  ): Promise<ITicket> {
    const ticket = await this.findTicketOrThrow(ticketId);
    await this.assertProjectMembership(callerId, ticket.projectId.toString());

    const updated = await ticketRepository.addComment(
      new Types.ObjectId(ticketId),
      {
        userId: new Types.ObjectId(callerId),
        text: dto.text,
      },
    );

    if (!updated) throw new NotFoundError('Ticket', ticketId);

    logger.info({ ticketId, callerId }, 'Comment added to ticket');
    return updated;
  }

  /**
   * Delete a ticket. Only manager/admin or the reporter can delete.
   * Cannot delete a ticket that's in an active sprint.
   */
  async deleteTicket(
    callerId: string,
    callerRole: UserRole,
    ticketId: string,
  ): Promise<void> {
    const ticket = await this.findTicketOrThrow(ticketId);
    await this.assertProjectMembership(callerId, ticket.projectId.toString());

    const isReporter = ticket.reporterId.toString() === callerId;
    const isManagerOrAdmin = callerRole === 'admin' || callerRole === 'manager';

    if (!isReporter && !isManagerOrAdmin) {
      throw new ForbiddenError(
        'Only the ticket reporter or a manager/admin can delete tickets',
      );
    }

    // Prevent deletion if ticket is in an active sprint
    if (ticket.sprintId) {
      const sprint = await sprintRepository.findById(ticket.sprintId);
      if (sprint?.status === 'ACTIVE') {
        throw new BusinessRuleError(
          'Cannot delete a ticket that is assigned to an active sprint. ' +
            'Remove it from the sprint first.',
        );
      }

      // Adjust sprint capacity if ticket had story points
      if (ticket.storyPoints) {
        await sprintRepository.adjustCapacity(
          ticket.sprintId,
          -ticket.storyPoints,
        );
      }
    }

    await ticketRepository.delete(new Types.ObjectId(ticketId));
    logger.info({ ticketId, callerId }, 'Ticket deleted');
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async findTicketOrThrow(ticketId: string): Promise<ITicket> {
    let objectId: Types.ObjectId;
    try {
      objectId = new Types.ObjectId(ticketId);
    } catch {
      throw new NotFoundError('Ticket', ticketId);
    }

    const ticket = await ticketRepository.findById(objectId);
    if (!ticket) throw new NotFoundError('Ticket', ticketId);
    return ticket;
  }

  private assertValidStatusTransition(
    current: TicketStatusValue,
    target: TicketStatusValue,
  ): void {
    const allowed = VALID_TRANSITIONS[current];
    if (!allowed.includes(target)) {
      throw new BusinessRuleError(
        `Cannot transition ticket from '${current}' to '${target}'. ` +
          `Valid transitions from '${current}': ${allowed.join(', ')}.`,
      );
    }
  }

  private async assertProjectMembership(
    callerId: string,
    projectId: string,
  ): Promise<void> {
    const project = await projectRepository.findById(
      new Types.ObjectId(projectId),
    );
    if (!project) throw new NotFoundError('Project', projectId);

    const isMember = project.memberIds.some(
      (id: Types.ObjectId) => id.toString() === callerId,
    );
    if (!isMember) throw new NotFoundError('Project', projectId);
  }
}

export const ticketService = new TicketService();