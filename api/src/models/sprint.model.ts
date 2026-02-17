import mongoose, { Document, Schema } from 'mongoose';

export enum SprintStatus {
  PLANNING = 'planning',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export interface ISprintGoal {
  description: string;
  completed: boolean;
}

export interface ISprint extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string;
  goal: string;
  goals: ISprintGoal[];
  startDate: Date;
  endDate: Date;
  status: SprintStatus;
  velocityTarget?: number;
  actualVelocity?: number;
  riskScore?: number; // AI-generated
  createdAt: Date;
  updatedAt: Date;
}

const sprintGoalSchema = new Schema<ISprintGoal>(
  {
    description: { type: String, required: true },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const sprintSchema = new Schema<ISprint>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    goal: {
      type: String,
      trim: true,
      default: '',
    },
    goals: [sprintGoalSchema],
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
      validate: {
        validator: function (this: ISprint, endDate: Date) {
          return endDate > this.startDate;
        },
        message: 'End date must be after start date',
      },
    },
    status: {
      type: String,
      enum: Object.values(SprintStatus),
      default: SprintStatus.PLANNING,
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
  },
  {
    timestamps: true,
  }
);

// Indexes
sprintSchema.index({ projectId: 1, status: 1 });
sprintSchema.index({ startDate: 1, endDate: 1 });
sprintSchema.index({ status: 1 });

// Virtual for tickets
sprintSchema.virtual('tickets', {
  ref: 'Ticket',
  localField: '_id',
  foreignField: 'sprintId',
});

export const Sprint = mongoose.model<ISprint>('Sprint', sprintSchema);