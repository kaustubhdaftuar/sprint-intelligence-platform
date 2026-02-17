import { Types } from 'mongoose';
import { Sprint, ISprint, ISprintDocument } from '@/models/sprint.model';
import type { SprintStatusValue } from '@/models/sprint.model';

/**
 * SprintRepository — DB access only.
 *
 * Rules:
 * - No business logic, no state machine checks
 * - All writes use atomic operators where possible ($set, $inc)
 * - Returns plain objects via .lean() except where Document is needed
 * - The two-active-sprint constraint is enforced by the partial unique
 *   index on the model — the repository does not re-check it
 */

export interface CreateSprintInput {
  projectId: Types.ObjectId;
  name: string;
  goal: string;
  startDate: Date;
  endDate: Date;
  velocityTarget?: number;
}

export interface UpdateSprintInput {
  name?: string;
  goal?: string;
  startDate?: Date;
  endDate?: Date;
  velocityTarget?: number;
}

export class SprintRepository {
  async create(data: CreateSprintInput): Promise<ISprintDocument> {
    const sprint = new Sprint(data);
    return sprint.save();
  }

  /**
   * Find all sprints for a project, optionally filtered by status.
   * Ordered newest first by default.
   */
  async findByProject(
    projectId: Types.ObjectId,
    status?: SprintStatusValue,
    skip = 0,
    limit = 20,
  ): Promise<ISprint[]> {
    const filter: Record<string, unknown> = { projectId };
    if (status) filter['status'] = status;

    return Sprint.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
  }

  async countByProject(
    projectId: Types.ObjectId,
    status?: SprintStatusValue,
  ): Promise<number> {
    const filter: Record<string, unknown> = { projectId };
    if (status) filter['status'] = status;
    return Sprint.countDocuments(filter);
  }

  async findById(id: Types.ObjectId): Promise<ISprint | null> {
    return Sprint.findById(id).lean().exec();
  }

  /**
   * Find the currently active sprint for a project.
   * Returns null if no sprint is active (valid state).
   */
  async findActiveSprint(projectId: Types.ObjectId): Promise<ISprint | null> {
    return Sprint.findOne({ projectId, status: 'ACTIVE' }).lean().exec();
  }

  async update(
    id: Types.ObjectId,
    data: UpdateSprintInput,
  ): Promise<ISprint | null> {
    return Sprint.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
  }

  /**
   * Transition sprint status.
   * The service is responsible for validating the transition is legal.
   * Repository just performs the write.
   *
   * When completing a sprint, actualVelocity is recorded atomically
   * in the same update to avoid a separate round-trip.
   */
  async setStatus(
    id: Types.ObjectId,
    status: SprintStatusValue,
    actualVelocity?: number,
  ): Promise<ISprint | null> {
    const updatePayload: Record<string, unknown> = { status };
    if (status === 'DONE' && actualVelocity !== undefined) {
      updatePayload['actualVelocity'] = actualVelocity;
    }

    return Sprint.findByIdAndUpdate(
      id,
      { $set: updatePayload },
      { new: true },
    )
      .lean()
      .exec();
  }

  /**
   * Atomically increment or decrement capacityPoints.
   * Called when tickets are assigned to or removed from this sprint.
   * Using $inc ensures concurrent ticket assignments don't clobber each other.
   *
   * @param delta - positive to add, negative to subtract
   */
  async adjustCapacity(id: Types.ObjectId, delta: number): Promise<void> {
    await Sprint.findByIdAndUpdate(id, { $inc: { capacityPoints: delta } });
  }

  /**
   * Set riskScore — written by AI service asynchronously.
   * Separate method because it's a different write path (AI service → DB directly).
   */
  async setRiskScore(id: Types.ObjectId, riskScore: number): Promise<void> {
    await Sprint.findByIdAndUpdate(id, { $set: { riskScore } });
  }

  /**
   * Find sprints whose endDate has passed but are still ACTIVE.
   * Used by the worker service SLA sweep.
   */
  async findOverdueSprints(): Promise<ISprint[]> {
    return Sprint.find({
      status: 'ACTIVE',
      endDate: { $lt: new Date() },
    })
      .lean()
      .exec();
  }
}

export const sprintRepository = new SprintRepository();