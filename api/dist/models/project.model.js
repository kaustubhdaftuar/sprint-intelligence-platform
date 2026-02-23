"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Project = void 0;
const mongoose_1 = require("mongoose");
const ProjectSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500,
    },
    ownerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true, // Fast lookup: "projects owned by user X"
    },
    memberIds: {
        type: [mongoose_1.Schema.Types.ObjectId],
        ref: 'User',
        default: [],
        index: true, // Fast lookup: "projects user X is a member of"
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true, // Every query filters isDeleted: false — needs index
    },
    deletedAt: {
        type: Date,
    },
}, {
    timestamps: true, // Adds createdAt, updatedAt automatically
    // Exclude __v from all query results
    versionKey: false,
    toJSON: {
        // Transform _id → id for cleaner API responses
        transform: (_doc, ret) => {
            const { _id, isDeleted, deletedAt, ...rest } = ret;
            return {
                id: _id.toString(),
                ...rest,
            };
        },
    },
});
// ─── Compound Indexes ────────────────────────────────────────────────────────
// The most common query: active projects for a given user (as member or owner)
ProjectSchema.index({ memberIds: 1, isDeleted: 1 });
ProjectSchema.index({ ownerId: 1, isDeleted: 1 });
// ─── Instance Methods ────────────────────────────────────────────────────────
/**
 * Check if a user is a member of this project.
 * Used in service layer for authorization checks on nested resources.
 */
ProjectSchema.methods['isMember'] = function (userId) {
    return this.memberIds.some((id) => id.equals(userId));
};
exports.Project = (0, mongoose_1.model)('Project', ProjectSchema);
