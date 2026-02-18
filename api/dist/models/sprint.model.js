"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sprint = exports.SPRINT_STATUS_VALUES = void 0;
const mongoose_1 = require("mongoose");
/**
 * Sprint status — UPPERCASE to match shared.validators.ts SprintStatus type.
 * State machine: PLANNING → ACTIVE → DONE
 * No CANCELLED state until cancellation logic is fully implemented end-to-end.
 *
 * Do not use this enum in service/repository/controller layers.
 * Import SprintStatus from shared.validators.ts instead, so the validator
 * and model always stay in sync from a single source.
 */
exports.SPRINT_STATUS_VALUES = ['PLANNING', 'ACTIVE', 'DONE'];
// ─── Subschema ────────────────────────────────────────────────────────────────
const SprintGoalSchema = new mongoose_1.Schema({
    description: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
}, { _id: false });
// ─── Main Schema ──────────────────────────────────────────────────────────────
const SprintSchema = new mongoose_1.Schema({
    projectId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
    },
    goal: {
        type: String,
        trim: true,
        default: '',
        maxlength: 500,
    },
    goals: {
        type: [SprintGoalSchema],
        default: [],
    },
    startDate: {
        type: Date,
        required: true,
    },
    endDate: {
        type: Date,
        required: true,
        validate: {
            validator: function (endDate) {
                return endDate > this.startDate;
            },
            message: 'endDate must be after startDate',
        },
    },
    status: {
        type: String,
        enum: exports.SPRINT_STATUS_VALUES,
        default: 'PLANNING',
    },
    capacityPoints: {
        type: Number,
        default: 0,
        min: 0,
    },
    velocityTarget: {
        type: Number,
        min: 0,
    },
    actualVelocity: {
        type: Number,
        min: 0,
    },
    riskScore: {
        type: Number,
        min: 0,
        max: 100,
    },
}, {
    timestamps: true,
    versionKey: false,
    toJSON: {
        transform: (_doc, ret) => {
            ret.id = ret._id.toString();
            delete ret._id;
        },
    },
});
// ─── Indexes ──────────────────────────────────────────────────────────────────
// Fast lookup: all sprints for a project filtered by status
SprintSchema.index({ projectId: 1, status: 1 });
// Fast lookup: sprints by date range (used by worker service SLA checks)
SprintSchema.index({ startDate: 1, endDate: 1 });
/**
 * Partial unique index — enforces the one-active-sprint-per-project constraint
 * at the database level.
 *
 * Why at DB level and not just service level:
 * A service-layer check (find active → if exists throw) has a race condition:
 * two concurrent requests can both pass the check before either writes.
 * A partial unique index makes a second ACTIVE sprint for the same project
 * structurally impossible regardless of concurrency.
 *
 * partialFilterExpression: only applies the unique constraint when
 * status = 'ACTIVE'. PLANNING and DONE sprints are not constrained
 * (a project can have many past/future sprints).
 */
SprintSchema.index({ projectId: 1 }, {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE' },
    name: 'unique_active_sprint_per_project',
});
// ─── Virtuals ─────────────────────────────────────────────────────────────────
/**
 * Virtual: populate tickets for this sprint.
 * Not stored in DB — populated on demand via .populate('tickets').
 * Used when fetching sprint detail with ticket list.
 */
SprintSchema.virtual('tickets', {
    ref: 'Ticket',
    localField: '_id',
    foreignField: 'sprintId',
});
exports.Sprint = (0, mongoose_1.model)('Sprint', SprintSchema);
