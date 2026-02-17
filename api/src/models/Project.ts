import mongoose, { Document, Schema } from 'mongoose';

export interface IProject extends Document {
  name: string;
  description: string;
  key: string; // Short identifier like "PROJ"
  ownerId: mongoose.Types.ObjectId;
  teamMembers: mongoose.Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    key: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      validate: {
        validator: (key: string) => /^[A-Z]{2,6}$/.test(key),
        message: 'Project key must be 2-6 uppercase letters',
      },
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    teamMembers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
projectSchema.index({ ownerId: 1 });
projectSchema.index({ teamMembers: 1 });
projectSchema.index({ key: 1 }, { unique: true });
projectSchema.index({ isActive: 1 });

// Virtual for sprint count
projectSchema.virtual('sprints', {
  ref: 'Sprint',
  localField: '_id',
  foreignField: 'projectId',
});

export const Project = mongoose.model<IProject>('Project', projectSchema);