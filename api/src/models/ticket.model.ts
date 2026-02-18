import { Schema, model, Document, Types } from 'mongoose';

/**
 * Ticket status — UPPERCASE, matches shared.validators.ts TICKET_STATUSES.
 *
 * State machine: TODO → IN_PROGRESS → REVIEW → DONE
 * BACKLOG is not a status — it's the absence of a sprintId.
 *   A ticket with no sprintId is implicitly in the backlog.
 *   A ticket with a sprintId starts at TODO.
 *
 * BLOCKED is not a status — it's the isBlocked flag (orthogonal concern).
 *   A blocked ticket retains its current status (e.g. IN_PROGRESS + isBlocked=true).
 *   This preserves state history and avoids the restore-on-unblock problem.
 */
export const TICKET_STATUS_VALUES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;
export type TicketStatusValue = typeof TICKET_STATUS_VALUES[number];

/**
 * Ticket priority — UPPERCASE, matches shared.validators.ts TICKET_PRIORITIES.
 * aiSuggestions.priority also uses this type — AI service writes UPPERCASE values.
 */
export const TICKET_PRIORITY_VALUES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type TicketPriorityValue = typeof TICKET_PRIORITY_VALUES[number];

/**
 * Ticket type — story/bug/task/epic.
 * No state machine on type — it can be changed freely.
 */
export const TICKET_TYPE_VALUES = ['STORY', 'BUG', 'TASK', 'EPIC'] as const;
export type TicketTypeValue = typeof TICKET_TYPE_VALUES[number];

/**
 * Valid Fibonacci story points.
 * Enforced at both API layer (Zod) and DB layer (enum) so worker/AI
 * service writes are also constrained.
 */
export const STORY_POINT_VALUES = [1, 2, 3, 5, 8, 13, 21] as const;
export type StoryPointValue = typeof STORY_POINT_VALUES[number];

// ─── Subdocument interfaces ───────────────────────────────────────────────────

export interface IComment {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  text: string;
  createdAt: Date;
}

export interface IAISuggestions {
  priority?: TicketPriorityValue;
  estimatedHours?: number;
  similarTickets?: Types.ObjectId[];
  summary?: string;
}

// ─── Main interface ───────────────────────────────────────────────────────────

/**
 * ITicket — plain TypeScript interface.
 * Used in service and repository signatures.
 * Must NOT extend Document.
 */
export interface ITicket {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  sprintId?: Types.ObjectId;       // Undefined = backlog; set = assigned to sprint
  ticketNumber: number;            // Auto-incremented per project (1, 2, 3...)
  key: string;                     // e.g. "PROJ-42" — projectKey + ticketNumber
  title: string;
  description: string;
  type: TicketTypeValue;
  status: TicketStatusValue;
  priority: TicketPriorityValue;
  storyPoints?: StoryPointValue;
  assignedTo?: Types.ObjectId;
  reporterId: Types.ObjectId;
  tags: string[];
  comments: IComment[];
  estimatedHours?: number;
  actualHours?: number;
  dueDate?: Date;
  lastActivityAt: Date;            // Updated on status change — used by blocker detection
  isBlocked: boolean;              // Set by worker service; orthogonal to status
  blockedReason?: string;
  aiSuggestions?: IAISuggestions;  // Written by AI service asynchronously
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ITicketDocument — Mongoose Document type.
 * Used ONLY in model file and repository layer.
 */
export interface ITicketDocument extends ITicket, Document {
  _id: Types.ObjectId;
}

// ─── Subschemas ───────────────────────────────────────────────────────────────

const CommentSchema = new Schema<IComment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const AISuggestionsSchema = new Schema<IAISuggestions>(
  {
    priority: { type: String, enum: TICKET_PRIORITY_VALUES },
    estimatedHours: { type: Number, min: 0 },
    similarTickets: [{ type: Schema.Types.ObjectId, ref: 'Ticket' }],
    summary: { type: String, maxlength: 1000 },
  },
  { _id: false },
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const TicketSchema = new Schema<ITicketDocument>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    sprintId: {
      type: Schema.Types.ObjectId,
      ref: 'Sprint',
      default: undefined,   // Explicit undefined = backlog
    },
    ticketNumber: {
      type: Number,
      required: true,
    },
    key: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },
    description: {
      type: String,
      default: '',
      maxlength: 10000,
    },
    type: {
      type: String,
      enum: TICKET_TYPE_VALUES,
      default: 'TASK',
    },
    status: {
      type: String,
      enum: TICKET_STATUS_VALUES,
      default: 'TODO',
    },
    priority: {
      type: String,
      enum: TICKET_PRIORITY_VALUES,
      default: 'MEDIUM',
    },
    storyPoints: {
      type: Number,
      enum: STORY_POINT_VALUES,   // DB-level Fibonacci enforcement
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: undefined,
    },
    reporterId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    comments: {
      type: [CommentSchema],
      default: [],
    },
    estimatedHours: { type: Number, min: 0 },
    actualHours: { type: Number, min: 0 },
    dueDate: { type: Date },
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
    isBlocked: {
      type: Boolean,
      default: false,
      index: true,              // Worker queries: all blocked tickets in a project
    },
    blockedReason: {
      type: String,
      maxlength: 500,
    },
    aiSuggestions: {
      type: AISuggestionsSchema,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete (ret as any)._id;
      },
    },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Unique ticket number per project
TicketSchema.index({ projectId: 1, ticketNumber: 1 }, { unique: true });

// Unique key globally (e.g. "PROJ-42")
TicketSchema.index({ key: 1 }, { unique: true });

// Primary query patterns
TicketSchema.index({ projectId: 1, status: 1 });
TicketSchema.index({ sprintId: 1, status: 1 });
TicketSchema.index({ assignedTo: 1, status: 1 });

/**
 * Blocker detection query — worker sweeps tickets inactive for > N days.
 * Query shape: { lastActivityAt: { $lt: cutoffDate }, sprintId: { $exists: true } }
 * This index makes that sweep efficient.
 */
TicketSchema.index({ lastActivityAt: 1, sprintId: 1 });

// ─── Pre-save hooks ───────────────────────────────────────────────────────────

/**
 * Update lastActivityAt when status or comments change.
 * The worker service uses this field to detect stale/blocked tickets.
 * Do not update on every save — only on meaningful activity changes.
 */
TicketSchema.pre('save', function (next) {
  if (this.isModified('status') || this.isModified('comments')) {
    this.lastActivityAt = new Date();
  }
  next();
});

/**
 * Note on ticketNumber generation:
 * getNextTicketNumber as a static with findOne().sort() has a race condition —
 * two concurrent creates read the same last number and collide.
 * The unique index { projectId, ticketNumber } will catch the collision,
 * but the caller gets a raw MongoServerError instead of a clean retry.
 *
 * Production fix: use a separate `counters` collection with $inc (atomic).
 * Implemented in ticket.repository.ts using findOneAndUpdate + $inc.
 * Do not implement ticket numbering logic in this model file.
 */

export const Ticket = model<ITicketDocument>('Ticket', TicketSchema);