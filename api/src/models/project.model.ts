import { Schema, model, Document, Types } from 'mongoose';

/**
 * IProject — the plain TypeScript interface (used across layers).
 * Never import the Mongoose Document type into service/repository signatures —
 * keep Mongoose contained to the model and repository layers.
 */
export interface IProject {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  ownerId: Types.ObjectId;          // User who created it (admin/manager)
  memberIds: Types.ObjectId[];      // All members including owner
  isDeleted: boolean;               // Soft delete — never hard delete projects
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProjectDocument extends IProject, Document {
  _id: Types.ObjectId;
}

const ProjectSchema = new Schema<IProjectDocument>(
  {
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
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,          // Fast lookup: "projects owned by user X"
    },
    memberIds: {
      type: [Schema.Types.ObjectId],
      ref: 'User',
      default: [],
      index: true,          // Fast lookup: "projects user X is a member of"
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,          // Every query filters isDeleted: false — needs index
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,       // Adds createdAt, updatedAt automatically
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
  },
);

// ─── Compound Indexes ────────────────────────────────────────────────────────

// The most common query: active projects for a given user (as member or owner)
ProjectSchema.index({ memberIds: 1, isDeleted: 1 });
ProjectSchema.index({ ownerId: 1, isDeleted: 1 });

// ─── Instance Methods ────────────────────────────────────────────────────────

/**
 * Check if a user is a member of this project.
 * Used in service layer for authorization checks on nested resources.
 */
ProjectSchema.methods['isMember'] = function (userId: Types.ObjectId): boolean {
  return this.memberIds.some((id: Types.ObjectId) => id.equals(userId));
};

export const Project = model<IProjectDocument>('Project', ProjectSchema);