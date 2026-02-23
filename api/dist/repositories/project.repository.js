"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectRepository = exports.ProjectRepository = void 0;
const project_model_1 = require("../models/project.model");
class ProjectRepository {
    /**
     * Create a new project. The owner is automatically added to memberIds
     * by the service before calling this — repo doesn't enforce that rule.
     */
    async create(data) {
        const project = new project_model_1.Project(data);
        return project.save();
    }
    /**
     * Find all non-deleted projects where userId is a member.
     * This is the primary list query — member-scoped, never returns all projects.
     */
    async findByMember(userId, skip, limit) {
        return project_model_1.Project.find({ memberIds: userId, isDeleted: false })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
            .exec();
    }
    /**
     * Count total projects for a member — used for pagination metadata.
     */
    async countByMember(userId) {
        return project_model_1.Project.countDocuments({ memberIds: userId, isDeleted: false });
    }
    /**
     * Find by ID. Returns null if not found or soft-deleted.
     */
    async findById(id) {
        return project_model_1.Project.findOne({ _id: id, isDeleted: false }).lean().exec();
    }
    /**
     * Update name/description. Returns the updated document or null.
     * { new: true } returns the post-update document.
     */
    async update(id, data) {
        return project_model_1.Project.findOneAndUpdate({ _id: id, isDeleted: false }, { $set: data }, { new: true, runValidators: true })
            .lean()
            .exec();
    }
    /**
     * Soft delete — sets isDeleted: true and records timestamp.
     * Hard deletes are never performed; data is retained for audit.
     */
    async softDelete(id) {
        const result = await project_model_1.Project.updateOne({ _id: id, isDeleted: false }, { $set: { isDeleted: true, deletedAt: new Date() } });
        return result.modifiedCount === 1;
    }
    /**
     * Add a member to the project (idempotent — $addToSet prevents duplicates).
     */
    async addMember(projectId, userId) {
        return project_model_1.Project.findOneAndUpdate({ _id: projectId, isDeleted: false }, { $addToSet: { memberIds: userId } }, { new: true })
            .lean()
            .exec();
    }
    /**
     * Remove a member from the project.
     * Service layer is responsible for preventing owner removal.
     */
    async removeMember(projectId, userId) {
        return project_model_1.Project.findOneAndUpdate({ _id: projectId, isDeleted: false }, { $pull: { memberIds: userId } }, { new: true })
            .lean()
            .exec();
    }
    /**
     * Check if a project name already exists for this owner.
     * Used by service to prevent duplicate project names per owner.
     */
    async existsByNameAndOwner(name, ownerId) {
        const count = await project_model_1.Project.countDocuments({
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }, // Case-insensitive
            ownerId,
            isDeleted: false,
        });
        return count > 0;
    }
}
exports.ProjectRepository = ProjectRepository;
// Export a singleton — no need for DI container at this scale
exports.projectRepository = new ProjectRepository();
