"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sprintRepository = exports.SprintRepository = void 0;
const sprint_model_1 = require("../models/sprint.model");
class SprintRepository {
    async create(data) {
        const sprint = new sprint_model_1.Sprint(data);
        return sprint.save();
    }
    /**
     * Find all sprints for a project, optionally filtered by status.
     * Ordered newest first by default.
     */
    async findByProject(projectId, status, skip = 0, limit = 20) {
        const filter = { projectId };
        if (status)
            filter['status'] = status;
        return sprint_model_1.Sprint.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
            .exec();
    }
    async countByProject(projectId, status) {
        const filter = { projectId };
        if (status)
            filter['status'] = status;
        return sprint_model_1.Sprint.countDocuments(filter);
    }
    async findById(id) {
        return sprint_model_1.Sprint.findById(id).lean().exec();
    }
    /**
     * Find the currently active sprint for a project.
     * Returns null if no sprint is active (valid state).
     */
    async findActiveSprint(projectId) {
        return sprint_model_1.Sprint.findOne({ projectId, status: 'ACTIVE' }).lean().exec();
    }
    async update(id, data) {
        return sprint_model_1.Sprint.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
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
    async setStatus(id, status, actualVelocity) {
        const updatePayload = { status };
        if (status === 'DONE' && actualVelocity !== undefined) {
            updatePayload['actualVelocity'] = actualVelocity;
        }
        return sprint_model_1.Sprint.findByIdAndUpdate(id, { $set: updatePayload }, { new: true })
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
    async adjustCapacity(id, delta) {
        await sprint_model_1.Sprint.findByIdAndUpdate(id, { $inc: { capacityPoints: delta } });
    }
    /**
     * Set riskScore — written by AI service asynchronously.
     * Separate method because it's a different write path (AI service → DB directly).
     */
    async setRiskScore(id, riskScore) {
        await sprint_model_1.Sprint.findByIdAndUpdate(id, { $set: { riskScore } });
    }
    /**
     * Find sprints whose endDate has passed but are still ACTIVE.
     * Used by the worker service SLA sweep.
     */
    async findOverdueSprints() {
        return sprint_model_1.Sprint.find({
            status: 'ACTIVE',
            endDate: { $lt: new Date() },
        })
            .lean()
            .exec();
    }
}
exports.SprintRepository = SprintRepository;
exports.sprintRepository = new SprintRepository();
