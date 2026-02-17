import { Types, ClientSession } from 'mongoose';
import { Ticket, ITicket, ITicketDocument } from '@/models/ticket.model';
import type { TicketStatusValue, TicketPriorityValue } from '@/models/ticket.model';

/**
 * TicketRepository — DB access only.
 *
 * Key implementation details:
 *
 * 1. Ticket numbering uses an atomic $inc counter to avoid the
 *    race condition in the original getNextTicketNumber static.
 *    A separate `counters` collection holds { _id: projectId, seq: number }.
 *
 * 2. assignToSprint / removeFromSprint return the story point delta
 *    so the caller (SprintService) can update capacityPoints in one
 *    extra call without re-fetching tickets.
 *
 * 3. lastActivityAt is NOT updated here — it's handled by the pre-save
 *    hook on the model, which fires on status and comment changes.
 *    Direct updateOne/findOneAndUpdate calls bypass pre-save hooks,
 *    so status transitions use findById + save() pattern to trigger the hook.
 */

export interface CreateTicketInput {
  projectId: Types.ObjectId;
  reporterId: Types.ObjectId;
  ticketNumber: number;
  key: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  storyPoints?: number;
  assignedTo?: Types.ObjectId;
  tags: string[];
  estimatedHours?: number;
  dueDate?: Date;
}

export interface UpdateTicketInput {
  title?: string;
  description?: string;
  type?: string;
  priority?: string;
  storyPoints?: number;
  assignedTo?: Types.ObjectId | null;
  tags?: string[];
  estimatedHours?: number;
  actualHours?: number;
  dueDate?: Date | null;
}

export interface ListTicketsFilter {
  projectId: Types.ObjectId;
  sprintId?: Types.ObjectId;
  noSprint?: boolean;          // true = backlog query
  status?: TicketStatusValue;
  assignedTo?: Types.ObjectId;
  priority?: TicketPriorityValue;
  isBlocked?: boolean;
}

export class TicketRepository {
  /**
   * Get next ticket number for a project using atomic $inc.
   * Uses a counters collection to avoid race conditions.
   * findOneAndUpdate with upsert:true creates the counter on first use.
   *
   * Returns the new sequence number (already incremented).
   */
  async getNextTicketNumber(projectId: Types.ObjectId): Promise<number> {
    // Import inline to avoid circular dependency at module load time
    const { default: mongoose } = await import('mongoose');
    const db = mongoose.connection.db;

    if (!db) throw new Error('Database connection not established');

    const result = await db.collection('counters').findOneAndUpdate(
      { _id: projectId.toString() },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    );

    return (result as { seq: number } | null)?.seq ?? 1;
  }

  async create(data: CreateTicketInput): Promise<ITicketDocument> {
    const ticket = new Ticket(data);
    return ticket.save();
  }

  async findById(id: Types.ObjectId): Promise<ITicket | null> {
    return Ticket.findById(id).lean().exec();
  }

  /**
   * Find multiple tickets by their IDs.
   * Used by sprint service to validate bulk assignment.
   * Returns only found tickets — caller checks length vs input length.
   */
  async findManyByIds(ids: Types.ObjectId[]): Promise<ITicket[]> {
    return Ticket.find({ _id: { $in: ids } })
      .lean()
      .exec();
  }

  /**
   * List tickets with flexible filtering.
   * backlog = sprintId does not exist on document.
   */
  async findMany(
    filter: ListTicketsFilter,
    skip: number,
    limit: number,
  ): Promise<ITicket[]> {
    const query = this.buildFilter(filter);
    return Ticket.find(query)
      .sort({ priority: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
  }

  async countMany(filter: ListTicketsFilter): Promise<number> {
    const query = this.buildFilter(filter);
    return Ticket.countDocuments(query);
  }

  /**
   * Find all tickets in a sprint with a specific status.
   * Called by sprint.service.completeSprint to compute actualVelocity.
   */
  async findBySprintAndStatus(
    sprintId: Types.ObjectId,
    status: TicketStatusValue,
  ): Promise<ITicket[]> {
    return Ticket.find({ sprintId, status })
      .lean()
      .exec();
  }

  /**
   * Update ticket fields. Returns updated document.
   * Does NOT trigger pre-save hook — do not use for status changes.
   * For null values (unassign, remove dueDate), $unset is used.
   */
  async update(
    id: Types.ObjectId,
    data: UpdateTicketInput,
  ): Promise<ITicket | null> {
    const setFields: Record<string, unknown> = {};
    const unsetFields: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === null) {
        unsetFields[key] = '';
      } else if (value !== undefined) {
        setFields[key] = value;
      }
    }

    const updateOp: Record<string, unknown> = {};
    if (Object.keys(setFields).length) updateOp['$set'] = setFields;
    if (Object.keys(unsetFields).length) updateOp['$unset'] = unsetFields;

    if (!Object.keys(updateOp).length) return this.findById(id);

    return Ticket.findByIdAndUpdate(id, updateOp, {
      new: true,
      runValidators: true,
    })
      .lean()
      .exec();
  }

  /**
   * Transition ticket status.
   * Uses findById + save() to trigger the pre-save hook,
   * which updates lastActivityAt on status change.
   *
   * Returns null if ticket not found.
   */
  async setStatus(
    id: Types.ObjectId,
    status: TicketStatusValue,
  ): Promise<ITicket | null> {
    const ticket = await Ticket.findById(id);
    if (!ticket) return null;

    ticket.status = status;
    // pre-save hook fires here and sets lastActivityAt = new Date()
    const saved = await ticket.save();
    return saved.toObject() as ITicket;
  }

  /**
   * Set isBlocked flag. Written by worker service during blocker detection.
   * Does not change status — isBlocked is orthogonal to status.
   */
  async setBlocked(
    id: Types.ObjectId,
    isBlocked: boolean,
    blockedReason?: string,
  ): Promise<void> {
    const updateOp: Record<string, unknown> = {
      $set: { isBlocked, lastActivityAt: new Date() },
    };
    if (!isBlocked) {
      (updateOp['$unset'] as Record<string, string>) = { blockedReason: '' };
    } else if (blockedReason) {
      (updateOp['$set'] as Record<string, unknown>)['blockedReason'] = blockedReason;
    }
    await Ticket.findByIdAndUpdate(id, updateOp);
  }

  /**
   * Add a comment to a ticket.
   * Uses $push to append to the embedded comments array.
   * Also updates lastActivityAt (pre-save hook doesn't fire on updateOne —
   * we set it explicitly here).
   */
  async addComment(
    id: Types.ObjectId,
    comment: { userId: Types.ObjectId; text: string },
  ): Promise<ITicket | null> {
    return Ticket.findByIdAndUpdate(
      id,
      {
        $push: { comments: { ...comment, createdAt: new Date() } },
        $set: { lastActivityAt: new Date() },
      },
      { new: true },
    )
      .lean()
      .exec();
  }

  /**
   * Assign a batch of tickets to a sprint.
   * Returns the total story points of newly assigned tickets
   * so the caller can update sprint.capacityPoints atomically.
   *
   * Only assigns tickets not already in this sprint (idempotent).
   * Tickets already in another sprint are moved — caller should validate
   * this is intentional (service layer responsibility).
   */
  async assignToSprint(
    ticketIds: Types.ObjectId[],
    sprintId: Types.ObjectId,
  ): Promise<number> {
    // Fetch before update to know current state (for point delta calculation)
    const tickets = await Ticket.find({ _id: { $in: ticketIds } })
      .select('storyPoints sprintId')
      .lean()
      .exec();

    // Only count points for tickets not already in THIS sprint
    const pointsDelta = tickets
      .filter((t) => t.sprintId?.toString() !== sprintId.toString())
      .reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);

    await Ticket.updateMany(
      { _id: { $in: ticketIds } },
      { $set: { sprintId, status: 'TODO' } },
    );

    return pointsDelta;
  }

  /**
   * Remove a single ticket from a sprint (back to backlog).
   * Returns the ticket's story points so sprint.capacityPoints
   * can be decremented by the caller.
   */
  async removeFromSprint(
    ticketId: Types.ObjectId,
    sprintId: Types.ObjectId,
  ): Promise<number> {
    const ticket = await Ticket.findOne({ _id: ticketId, sprintId })
      .select('storyPoints')
      .lean()
      .exec();

    if (!ticket) return 0;

    await Ticket.findByIdAndUpdate(ticketId, {
      $unset: { sprintId: '' },
      $set: { status: 'TODO' },
    });

    return ticket.storyPoints ?? 0;
  }

  /**
   * Find tickets inactive beyond a cutoff date that are in an active sprint.
   * Called by the worker service blocker detection sweep.
   *
   * Query uses the compound index: { lastActivityAt: 1, sprintId: 1 }
   */
  async findStaleSprintTickets(
    cutoffDate: Date,
    projectId?: Types.ObjectId,
  ): Promise<ITicket[]> {
    const filter: Record<string, unknown> = {
      lastActivityAt: { $lt: cutoffDate },
      sprintId: { $exists: true },
      status: { $nin: ['DONE'] },
      isBlocked: false, // Don't re-flag already blocked tickets
    };
    if (projectId) filter['projectId'] = projectId;

    return Ticket.find(filter).lean().exec();
  }

  /**
   * Set AI suggestions on a ticket.
   * Called by AI service after generating priority suggestions.
   */
  async setAISuggestions(
    id: Types.ObjectId,
    suggestions: {
      priority?: string;
      estimatedHours?: number;
      summary?: string;
    },
  ): Promise<void> {
    await Ticket.findByIdAndUpdate(id, {
      $set: { aiSuggestions: suggestions },
    });
  }

  async delete(id: Types.ObjectId): Promise<boolean> {
    const result = await Ticket.findByIdAndDelete(id);
    return result !== null;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private buildFilter(
    filter: ListTicketsFilter,
  ): Record<string, unknown> {
    const query: Record<string, unknown> = {
      projectId: filter.projectId,
    };

    if (filter.sprintId) {
      query['sprintId'] = filter.sprintId;
    } else if (filter.noSprint) {
      query['sprintId'] = { $exists: false };
    }

    if (filter.status) query['status'] = filter.status;
    if (filter.assignedTo) query['assignedTo'] = filter.assignedTo;
    if (filter.priority) query['priority'] = filter.priority;
    if (filter.isBlocked !== undefined) query['isBlocked'] = filter.isBlocked;

    return query;
  }
}

export const ticketRepository = new TicketRepository();