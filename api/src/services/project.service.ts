import { Types } from 'mongoose';
import { projectRepository } from '@/repositories/project.repository';
import { IProject } from '@/models/project.model';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BusinessRuleError,
} from '@/errors/app.errors';
import type { UserRole } from '@/types/auth.types';
import type { PaginationQuery } from '@/validators/shared.validators';
import logger from '@/utils/logger';

/**
 * ProjectService — business rules only.
 *
 * No Express types (Request, Response) appear here.
 * No Mongoose queries appear here — all DB work is delegated to the repo.
 *
 * Business rules enforced:
 * 1. Only admin/manager roles can create projects
 * 2. Owner is always added as the first member
 * 3. Duplicate project names per owner are rejected
 * 4. Only the owner (or admin) can update/delete a project
 * 5. Owner cannot be removed from memberIds
 * 6. Member-scoped list queries — users only see their own projects
 */

export interface CreateProjectDto {
  name: string;
  description?: string;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
}

export interface AddMemberDto {
  memberId: string;
}

export interface ProjectListResult {
  projects: IProject[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ProjectService {
  /**
   * Create a project. Caller must be admin or manager.
   * Owner is automatically added as the first member.
   */
  async createProject(
    callerId: string,
    callerRole: UserRole,
    dto: CreateProjectDto,
  ): Promise<IProject> {
    if (callerRole === 'developer') {
      throw new ForbiddenError('Developers cannot create projects');
    }

    const ownerId = new Types.ObjectId(callerId);

    // Prevent duplicate project names for same owner
    const duplicate = await projectRepository.existsByNameAndOwner(dto.name, ownerId);
    if (duplicate) {
      throw new ConflictError(
        `You already have a project named '${dto.name}'. Choose a different name.`,
      );
    }

    const project = await projectRepository.create({
      name: dto.name.trim(),
      description: dto.description?.trim(),
      ownerId,
      memberIds: [ownerId], // Owner is always a member
    });

    logger.info({ projectId: project._id.toString(), ownerId: callerId }, 'Project created');

    return project;
  }

  /**
   * List projects the caller is a member of.
   * Admins still only see their own projects — if you need a global admin view,
   * add a separate admin endpoint. Don't conflate roles with data scope.
   */
  async listProjects(
    callerId: string,
    pagination: PaginationQuery,
  ): Promise<ProjectListResult> {
    const userId = new Types.ObjectId(callerId);
    const skip = (pagination.page - 1) * pagination.limit;

    const [projects, total] = await Promise.all([
      projectRepository.findByMember(userId, skip, pagination.limit),
      projectRepository.countByMember(userId),
    ]);

    return {
      projects,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  /**
   * Get a single project by ID.
   * Caller must be a member — prevents enumeration of other projects.
   */
  async getProject(callerId: string, projectId: string): Promise<IProject> {
    const project = await this.findProjectOrThrow(projectId);
    this.assertMembership(project, callerId);
    return project;
  }

  /**
   * Update name/description. Only owner or admin can update.
   */
  async updateProject(
    callerId: string,
    callerRole: UserRole,
    projectId: string,
    dto: UpdateProjectDto,
  ): Promise<IProject> {
    const project = await this.findProjectOrThrow(projectId);
    this.assertOwnerOrAdmin(project, callerId, callerRole);

    // If renaming, check for duplicates
    if (dto.name && dto.name.trim().toLowerCase() !== project.name.toLowerCase()) {
      const duplicate = await projectRepository.existsByNameAndOwner(
        dto.name,
        project.ownerId,
      );
      if (duplicate) {
        throw new ConflictError(`A project named '${dto.name}' already exists.`);
      }
    }

    const updated = await projectRepository.update(new Types.ObjectId(projectId), {
      name: dto.name?.trim(),
      description: dto.description?.trim(),
    });

    if (!updated) {
      throw new NotFoundError('Project', projectId);
    }

    logger.info({ projectId, callerId }, 'Project updated');
    return updated;
  }

  /**
   * Soft delete a project. Only owner or admin.
   * Note: We don't cascade-delete sprints/tickets here.
   * The worker service handles cleanup asynchronously.
   */
  async deleteProject(
    callerId: string,
    callerRole: UserRole,
    projectId: string,
  ): Promise<void> {
    const project = await this.findProjectOrThrow(projectId);
    this.assertOwnerOrAdmin(project, callerId, callerRole);

    const deleted = await projectRepository.softDelete(new Types.ObjectId(projectId));
    if (!deleted) {
      throw new NotFoundError('Project', projectId);
    }

    logger.info({ projectId, callerId }, 'Project soft-deleted');
  }

  /**
   * Add a member by user ID. Only owner or admin can add members.
   * The service does not validate that the userId corresponds to a real user
   * at this layer — that check would require a UserRepository lookup and is
   * an explicit scope decision (avoid N+1 validations in bulk operations).
   * Consider adding it if your UX requires immediate feedback on invalid IDs.
   */
  async addMember(
    callerId: string,
    callerRole: UserRole,
    projectId: string,
    memberId: string,
  ): Promise<IProject> {
    const project = await this.findProjectOrThrow(projectId);
    this.assertOwnerOrAdmin(project, callerId, callerRole);

    const updated = await projectRepository.addMember(
      new Types.ObjectId(projectId),
      new Types.ObjectId(memberId),
    );

    if (!updated) throw new NotFoundError('Project', projectId);

    logger.info({ projectId, memberId, callerId }, 'Member added to project');
    return updated;
  }

  /**
   * Remove a member. Owner cannot be removed.
   * Only owner or admin can perform this action.
   */
  async removeMember(
    callerId: string,
    callerRole: UserRole,
    projectId: string,
    memberId: string,
  ): Promise<IProject> {
    const project = await this.findProjectOrThrow(projectId);
    this.assertOwnerOrAdmin(project, callerId, callerRole);

    if (project.ownerId.toString() === memberId) {
      throw new BusinessRuleError('The project owner cannot be removed as a member.');
    }

    const updated = await projectRepository.removeMember(
      new Types.ObjectId(projectId),
      new Types.ObjectId(memberId),
    );

    if (!updated) throw new NotFoundError('Project', projectId);

    logger.info({ projectId, memberId, callerId }, 'Member removed from project');
    return updated;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async findProjectOrThrow(projectId: string): Promise<IProject> {
    let objectId: Types.ObjectId;
    try {
      objectId = new Types.ObjectId(projectId);
    } catch {
      throw new NotFoundError('Project', projectId);
    }

    const project = await projectRepository.findById(objectId);
    if (!project) throw new NotFoundError('Project', projectId);
    return project;
  }

  private assertMembership(project: IProject, callerId: string): void {
    const isMember = project.memberIds.some((id) => id.toString() === callerId);
    if (!isMember) {
      // Return 404, not 403 — don't reveal the project exists to non-members
      throw new NotFoundError('Project', project._id.toString());
    }
  }

  private assertOwnerOrAdmin(
    project: IProject,
    callerId: string,
    callerRole: UserRole,
  ): void {
    const isOwner = project.ownerId.toString() === callerId;
    const isAdmin = callerRole === 'admin';
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('Only the project owner or an admin can perform this action.');
    }
  }
}

export const projectService = new ProjectService();