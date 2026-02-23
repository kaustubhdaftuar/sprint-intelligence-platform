"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectService = exports.ProjectService = void 0;
const mongoose_1 = require("mongoose");
const project_repository_1 = require("../repositories/project.repository");
const app_errors_1 = require("../errors/app.errors");
const logger_1 = __importDefault(require("../utils/logger"));
class ProjectService {
    /**
     * Create a project. Caller must be admin or manager.
     * Owner is automatically added as the first member.
     */
    async createProject(callerId, callerRole, dto) {
        if (callerRole === 'developer') {
            throw new app_errors_1.ForbiddenError('Developers cannot create projects');
        }
        const ownerId = new mongoose_1.Types.ObjectId(callerId);
        // Prevent duplicate project names for same owner
        const duplicate = await project_repository_1.projectRepository.existsByNameAndOwner(dto.name, ownerId);
        if (duplicate) {
            throw new app_errors_1.ConflictError(`You already have a project named '${dto.name}'. Choose a different name.`);
        }
        const project = await project_repository_1.projectRepository.create({
            name: dto.name.trim(),
            description: dto.description?.trim(),
            ownerId,
            memberIds: [ownerId], // Owner is always a member
        });
        logger_1.default.info({ projectId: project._id.toString(), ownerId: callerId }, 'Project created');
        return project;
    }
    /**
     * List projects the caller is a member of.
     * Admins still only see their own projects — if you need a global admin view,
     * add a separate admin endpoint. Don't conflate roles with data scope.
     */
    async listProjects(callerId, pagination) {
        const userId = new mongoose_1.Types.ObjectId(callerId);
        const skip = (pagination.page - 1) * pagination.limit;
        const [projects, total] = await Promise.all([
            project_repository_1.projectRepository.findByMember(userId, skip, pagination.limit),
            project_repository_1.projectRepository.countByMember(userId),
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
    async getProject(callerId, projectId) {
        const project = await this.findProjectOrThrow(projectId);
        this.assertMembership(project, callerId);
        return project;
    }
    /**
     * Update name/description. Only owner or admin can update.
     */
    async updateProject(callerId, callerRole, projectId, dto) {
        const project = await this.findProjectOrThrow(projectId);
        this.assertOwnerOrAdmin(project, callerId, callerRole);
        // If renaming, check for duplicates
        if (dto.name && dto.name.trim().toLowerCase() !== project.name.toLowerCase()) {
            const duplicate = await project_repository_1.projectRepository.existsByNameAndOwner(dto.name, project.ownerId);
            if (duplicate) {
                throw new app_errors_1.ConflictError(`A project named '${dto.name}' already exists.`);
            }
        }
        const updated = await project_repository_1.projectRepository.update(new mongoose_1.Types.ObjectId(projectId), {
            name: dto.name?.trim(),
            description: dto.description?.trim(),
        });
        if (!updated) {
            throw new app_errors_1.NotFoundError('Project', projectId);
        }
        logger_1.default.info({ projectId, callerId }, 'Project updated');
        return updated;
    }
    /**
     * Soft delete a project. Only owner or admin.
     * Note: We don't cascade-delete sprints/tickets here.
     * The worker service handles cleanup asynchronously.
     */
    async deleteProject(callerId, callerRole, projectId) {
        const project = await this.findProjectOrThrow(projectId);
        this.assertOwnerOrAdmin(project, callerId, callerRole);
        const deleted = await project_repository_1.projectRepository.softDelete(new mongoose_1.Types.ObjectId(projectId));
        if (!deleted) {
            throw new app_errors_1.NotFoundError('Project', projectId);
        }
        logger_1.default.info({ projectId, callerId }, 'Project soft-deleted');
    }
    /**
     * Add a member by user ID. Only owner or admin can add members.
     * The service does not validate that the userId corresponds to a real user
     * at this layer — that check would require a UserRepository lookup and is
     * an explicit scope decision (avoid N+1 validations in bulk operations).
     * Consider adding it if your UX requires immediate feedback on invalid IDs.
     */
    async addMember(callerId, callerRole, projectId, memberId) {
        const project = await this.findProjectOrThrow(projectId);
        this.assertOwnerOrAdmin(project, callerId, callerRole);
        const updated = await project_repository_1.projectRepository.addMember(new mongoose_1.Types.ObjectId(projectId), new mongoose_1.Types.ObjectId(memberId));
        if (!updated)
            throw new app_errors_1.NotFoundError('Project', projectId);
        logger_1.default.info({ projectId, memberId, callerId }, 'Member added to project');
        return updated;
    }
    /**
     * Remove a member. Owner cannot be removed.
     * Only owner or admin can perform this action.
     */
    async removeMember(callerId, callerRole, projectId, memberId) {
        const project = await this.findProjectOrThrow(projectId);
        this.assertOwnerOrAdmin(project, callerId, callerRole);
        if (project.ownerId.toString() === memberId) {
            throw new app_errors_1.BusinessRuleError('The project owner cannot be removed as a member.');
        }
        const updated = await project_repository_1.projectRepository.removeMember(new mongoose_1.Types.ObjectId(projectId), new mongoose_1.Types.ObjectId(memberId));
        if (!updated)
            throw new app_errors_1.NotFoundError('Project', projectId);
        logger_1.default.info({ projectId, memberId, callerId }, 'Member removed from project');
        return updated;
    }
    // ─── Private helpers ────────────────────────────────────────────────────────
    async findProjectOrThrow(projectId) {
        let objectId;
        try {
            objectId = new mongoose_1.Types.ObjectId(projectId);
        }
        catch {
            throw new app_errors_1.NotFoundError('Project', projectId);
        }
        const project = await project_repository_1.projectRepository.findById(objectId);
        if (!project)
            throw new app_errors_1.NotFoundError('Project', projectId);
        return project;
    }
    assertMembership(project, callerId) {
        const isMember = project.memberIds.some((id) => id.toString() === callerId);
        if (!isMember) {
            // Return 404, not 403 — don't reveal the project exists to non-members
            throw new app_errors_1.NotFoundError('Project', project._id.toString());
        }
    }
    assertOwnerOrAdmin(project, callerId, callerRole) {
        const isOwner = project.ownerId.toString() === callerId;
        const isAdmin = callerRole === 'admin';
        if (!isOwner && !isAdmin) {
            throw new app_errors_1.ForbiddenError('Only the project owner or an admin can perform this action.');
        }
    }
}
exports.ProjectService = ProjectService;
exports.projectService = new ProjectService();
