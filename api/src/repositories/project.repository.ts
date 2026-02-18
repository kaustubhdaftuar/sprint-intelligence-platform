import { Types } from 'mongoose';
import { Project, IProject, IProjectDocument } from '@/models/project.model';

/**
 * ProjectRepository — DB access only.
 *
 * Rules enforced here:
 * - All reads automatically filter isDeleted: false (soft delete)
 * - No business logic — that belongs in ProjectService
 * - Returns plain objects or null, never throws business errors
 * - Lean queries (.lean()) return plain JS objects, not Mongoose Documents,
 *   which are faster and safe to pass up the stack
 *
 * Why lean():
 * - Mongoose Documents carry overhead (middleware, virtuals, methods)
 * - Service and controller layers should never depend on Mongoose Document methods
 * - lean() returns a plain object matching IProject
 *
 * Note: lean() strips the Mongoose Document type — return type is
 * IProject & { _id: Types.ObjectId } from MongoDB, which satisfies IProject.
 */

export interface CreateProjectInput {
  name: string;
  description?: string;
  ownerId: Types.ObjectId;
  memberIds: Types.ObjectId[];
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
}

export class ProjectRepository {
  /**
   * Create a new project. The owner is automatically added to memberIds
   * by the service before calling this — repo doesn't enforce that rule.
   */
  async create(data: CreateProjectInput): Promise<IProjectDocument> {
    const project = new Project(data);
    return project.save();
  }

  /**
   * Find all non-deleted projects where userId is a member.
   * This is the primary list query — member-scoped, never returns all projects.
   */
  async findByMember(
    userId: Types.ObjectId,
    skip: number,
    limit: number,
  ): Promise<IProject[]> {
    return Project.find({ memberIds: userId, isDeleted: false })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
  }

  /**
   * Count total projects for a member — used for pagination metadata.
   */
  async countByMember(userId: Types.ObjectId): Promise<number> {
    return Project.countDocuments({ memberIds: userId, isDeleted: false });
  }

  /**
   * Find by ID. Returns null if not found or soft-deleted.
   */
  async findById(id: Types.ObjectId): Promise<IProject | null> {
    return Project.findOne({ _id: id, isDeleted: false }).lean().exec();
  }

  /**
   * Update name/description. Returns the updated document or null.
   * { new: true } returns the post-update document.
   */
  async update(
    id: Types.ObjectId,
    data: UpdateProjectInput,
  ): Promise<IProject | null> {
    return Project.findOneAndUpdate(
      { _id: id, isDeleted: false },
      { $set: data },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
  }

  /**
   * Soft delete — sets isDeleted: true and records timestamp.
   * Hard deletes are never performed; data is retained for audit.
   */
  async softDelete(id: Types.ObjectId): Promise<boolean> {
    const result = await Project.updateOne(
      { _id: id, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } },
    );
    return result.modifiedCount === 1;
  }

  /**
   * Add a member to the project (idempotent — $addToSet prevents duplicates).
   */
  async addMember(
    projectId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<IProject | null> {
    return Project.findOneAndUpdate(
      { _id: projectId, isDeleted: false },
      { $addToSet: { memberIds: userId } },
      { new: true },
    )
      .lean()
      .exec();
  }

  /**
   * Remove a member from the project.
   * Service layer is responsible for preventing owner removal.
   */
  async removeMember(
    projectId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<IProject | null> {
    return Project.findOneAndUpdate(
      { _id: projectId, isDeleted: false },
      { $pull: { memberIds: userId } },
      { new: true },
    )
      .lean()
      .exec();
  }

  /**
   * Check if a project name already exists for this owner.
   * Used by service to prevent duplicate project names per owner.
   */
  async existsByNameAndOwner(name: string, ownerId: Types.ObjectId): Promise<boolean> {
    const count = await Project.countDocuments({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }, // Case-insensitive
      ownerId,
      isDeleted: false,
    });
    return count > 0;
  }
}

// Export a singleton — no need for DI container at this scale
export const projectRepository = new ProjectRepository();

