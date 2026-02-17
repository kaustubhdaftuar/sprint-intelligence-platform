import { Schema, model, Document, Types } from 'mongoose';

/**
 * Sprint status — UPPERCASE to match shared.validators.ts SprintStatus type.
 * State machine: PLANNING → ACTIVE → DONE
 * No CANCELLED state until cancellation logic is fully implemented end-to-end.
 *
 * Do not use this enum in service/repository/controller layers.
 * Import SprintStatus from shared.validators.ts instead, so the validator
 * and model always stay in sync from a single source.
 */
export const SPRINT_STATUS_VALUES = ['PLANNING', 'ACTIVE', 'DONE'] as const;
export type SprintStatusValue = typeof SPRINT_STATUS_VALUES[number];

/**
 * ISprintGoal — subdocument shape.
 * No _id needed (suppressed via { _id: false } on subschema).
 */
export interface ISprintGoal {
  description: string;
  completed: boolean;
}

/**
 * ISprint — plain TypeScript interface.
 * Used in service and repository signatures.
 * Must NOT extend Document — that would couple every layer above
 * the repository to Mongoose internals.
 */
export interface ISprint {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  name: string;
  goal: string;
  goals: ISprintGoal[];
  startDate: Date;
  endDate: Date;
  status: SprintStatusValue;
  capacityPoints: number;       // Sum of story points of assigned tickets (maintained on assignment)
  velocityTarget?: number;      // Planned story points for sprint (set at planning time)
  actualVelocity?: number;      // Computed at sprint close from DONE tickets
  riskScore?: number;           // Written by AI service asynchronously
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ISprintDocument — Mongoose Document type.
 * Used ONLY inside the model file and repository layer.
 * Never import this into services, controllers, or routes.
 */
export interface ISprintDocument extends ISprint, Document {
  _id: Types.ObjectId;
}

// ─── Subschema ────────────────────────────────────────────────────────────────

const SprintGoalSchema = new Schema<ISprintGoal>(
  {
    description: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
  },
  { _id: false },
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const SprintSchema = new Schema<ISprintDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
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
        validator: function (this: ISprintDocument, endDate: Date): boolean {
          return endDate > this.startDate;
        },
        message: 'endDate must be after startDate',
      },
    },
    status: {
      type: String,
      enum: SPRINT_STATUS_VALUES,
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
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
      },
    },
  },
);

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
SprintSchema.index(
  { projectId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE' },
    name: 'unique_active_sprint_per_project',
  },
);

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

export const Sprint = model<ISprintDocument>('Sprint', SprintSchema);