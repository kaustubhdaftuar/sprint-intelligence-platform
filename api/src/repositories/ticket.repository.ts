import { Ticket, ITicket, TicketStatus, TicketPriority } from '../models/Ticket';
import { Types } from 'mongoose';

export interface TicketFilters {
  projectId?: string | Types.ObjectId;
  sprintId?: string | Types.ObjectId;
  status?: TicketStatus | TicketStatus[];
  priority?: TicketPriority | TicketPriority[];
  assignedTo?: string | Types.ObjectId;
  isBlocked?: boolean;
  type?: string;
}

export interface TicketQueryOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  populate?: string[];
}

export class TicketRepository {
  /**
   * Create a new ticket
   */
  async create(ticketData: Partial<ITicket>): Promise<ITicket> {
    // Get next ticket number for the project
    const ticketNumber = await (Ticket as any).getNextTicketNumber(
      ticketData.projectId
    );
    
    // Assuming we fetch the project to get the key
    const ticket = new Ticket({
      ...ticketData,
      ticketNumber,
      key: `${ticketData.key || 'PROJ'}-${ticketNumber}`,
    });
    
    return await ticket.save();
  }

  /**
   * Find ticket by ID
   */
  async findById(
    id: string | Types.ObjectId,
    populate?: string[]
  ): Promise<ITicket | null> {
    let query = Ticket.findById(id);
    
    if (populate) {
      populate.forEach((field) => {
        query = query.populate(field);
      });
    }
    
    return await query;
  }

  /**
   * Find ticket by key (e.g., "PROJ-123")
   */
  async findByKey(key: string): Promise<ITicket | null> {
    return await Ticket.findOne({ key });
  }

  /**
   * Find tickets with filters and pagination
   */
  async findAll(
    filters: TicketFilters = {},
    options: TicketQueryOptions = {}
  ): Promise<{ tickets: ITicket[]; total: number; page: number; pages: number }> {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      populate = [],
    } = options;

    const query: any = {};

    // Build query
    if (filters.projectId) query.projectId = filters.projectId;
    if (filters.sprintId) query.sprintId = filters.sprintId;
    if (filters.status) {
      query.status = Array.isArray(filters.status)
        ? { $in: filters.status }
        : filters.status;
    }
    if (filters.priority) {
      query.priority = Array.isArray(filters.priority)
        ? { $in: filters.priority }
        : filters.priority;
    }
    if (filters.assignedTo) query.assignedTo = filters.assignedTo;
    if (filters.isBlocked !== undefined) query.isBlocked = filters.isBlocked;
    if (filters.type) query.type = filters.type;

    const skip = (page - 1) * limit;
    const sortOptions: any = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    let ticketQuery = Ticket.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    if (populate.length > 0) {
      populate.forEach((field) => {
        ticketQuery = ticketQuery.populate(field);
      });
    }

    const [tickets, total] = await Promise.all([
      ticketQuery,
      Ticket.countDocuments(query),
    ]);

    return {
      tickets,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Update ticket
   */
  async update(
    id: string | Types.ObjectId,
    updates: Partial<ITicket>
  ): Promise<ITicket | null> {
    return await Ticket.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
  }

  /**
   * Delete ticket
   */
  async delete(id: string | Types.ObjectId): Promise<ITicket | null> {
    return await Ticket.findByIdAndDelete(id);
  }

  /**
   * Get stale tickets (inactive for X days)
   */
  async findStaleTickets(
    days: number = 7,
    statuses: TicketStatus[] = [TicketStatus.IN_PROGRESS, TicketStatus.TODO]
  ): Promise<ITicket[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return await Ticket.find({
      status: { $in: statuses },
      lastActivityAt: { $lt: cutoffDate },
      isBlocked: false,
    })
      .populate('assignedTo', 'name email')
      .populate('projectId', 'name key');
  }

  /**
   * Get blocked tickets
   */
  async findBlockedTickets(projectId?: string | Types.ObjectId): Promise<ITicket[]> {
    const query: any = { isBlocked: true };
    if (projectId) query.projectId = projectId;

    return await Ticket.find(query)
      .populate('assignedTo', 'name email')
      .populate('projectId', 'name key');
  }

  /**
   * Assign ticket to sprint
   */
  async assignToSprint(
    ticketId: string | Types.ObjectId,
    sprintId: string | Types.ObjectId
  ): Promise<ITicket | null> {
    return await Ticket.findByIdAndUpdate(
      ticketId,
      { sprintId, status: TicketStatus.TODO },
      { new: true }
    );
  }

  /**
   * Remove ticket from sprint
   */
  async removeFromSprint(ticketId: string | Types.ObjectId): Promise<ITicket | null> {
    return await Ticket.findByIdAndUpdate(
      ticketId,
      { $unset: { sprintId: 1 }, status: TicketStatus.BACKLOG },
      { new: true }
    );
  }

  /**
   * Add comment to ticket
   */
  async addComment(
    ticketId: string | Types.ObjectId,
    comment: { userId: Types.ObjectId; text: string }
  ): Promise<ITicket | null> {
    return await Ticket.findByIdAndUpdate(
      ticketId,
      {
        $push: { comments: { ...comment, createdAt: new Date() } },
        lastActivityAt: new Date(),
      },
      { new: true }
    );
  }

  /**
   * Get ticket statistics for a project
   */
  async getProjectStats(projectId: string | Types.ObjectId) {
    const stats = await Ticket.aggregate([
      { $match: { projectId: new Types.ObjectId(projectId as string) } },
      {
        $facet: {
          byStatus: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
          byPriority: [
            { $group: { _id: '$priority', count: { $sum: 1 } } },
          ],
          totalStoryPoints: [
            { $group: { _id: null, total: { $sum: '$storyPoints' } } },
          ],
          blocked: [
            { $match: { isBlocked: true } },
            { $count: 'count' },
          ],
        },
      },
    ]);

    return stats[0];
  }
}