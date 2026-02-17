import mongoose, { Document, Schema } from 'mongoose';

export enum TicketStatus {
  BACKLOG = 'backlog',
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  IN_REVIEW = 'in_review',
  DONE = 'done',
  BLOCKED = 'blocked',
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum TicketType {
  STORY = 'story',
  BUG = 'bug',
  TASK = 'task',
  EPIC = 'epic',
}

export interface IComment {
  userId: mongoose.Types.ObjectId;
  text: string;
  createdAt: Date;
}

export interface ITicket extends Document {
  projectId: mongoose.Types.ObjectId;
  sprintId?: mongoose.Types.ObjectId;
  ticketNumber: number; // Auto-incremented per project
  key: string; // e.g., "PROJ-123"
  title: string;
  description: string;
  type: TicketType;
  status: TicketStatus;
  priority: TicketPriority;
  storyPoints?: number;
  assignedTo?: mongoose.Types.ObjectId;
  reporterId: mongoose.Types.ObjectId;
  tags: string[];
  comments: IComment[];
  attachments: string[];
  estimatedHours?: number;
  actualHours?: number;
  dueDate?: Date;
  lastActivityAt: Date;
  isBlocked: boolean;
  blockedReason?: string;
  aiSuggestions?: {
    priority?: TicketPriority;
    estimatedHours?: number;
    similarTickets?: mongoose.Types.ObjectId[];
    summary?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const commentSchema = new Schema<IComment>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const ticketSchema = new Schema<ITicket>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    sprintId: {
      type: Schema.Types.ObjectId,
      ref: 'Sprint',
    },
    ticketNumber: {
      type: Number,
      required: true,
    },
    key: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: Object.values(TicketType),
      default: TicketType.TASK,
    },
    status: {
      type: String,
      enum: Object.values(TicketStatus),
      default: TicketStatus.BACKLOG,
    },
    priority: {
      type: String,
      enum: Object.values(TicketPriority),
      default: TicketPriority.MEDIUM,
    },
    storyPoints: {
      type: Number,
      min: 0,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    reporterId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tags: [{ type: String }],
    comments: [commentSchema],
    attachments: [{ type: String }],
    estimatedHours: {
      type: Number,
      min: 0,
    },
    actualHours: {
      type: Number,
      min: 0,
    },
    dueDate: Date,
    lastActivityAt: {
      type: Date,
      default: Date.now,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockedReason: String,
    aiSuggestions: {
      priority: {
        type: String,
        enum: Object.values(TicketPriority),
      },
      estimatedHours: Number,
      similarTickets: [{ type: Schema.Types.ObjectId, ref: 'Ticket' }],
      summary: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
ticketSchema.index({ projectId: 1, ticketNumber: 1 }, { unique: true });
ticketSchema.index({ key: 1 }, { unique: true });
ticketSchema.index({ projectId: 1, status: 1 });
ticketSchema.index({ sprintId: 1, status: 1 });
ticketSchema.index({ assignedTo: 1, status: 1 });
ticketSchema.index({ lastActivityAt: 1 });
ticketSchema.index({ isBlocked: 1 });
ticketSchema.index({ priority: 1, status: 1 });

// Update lastActivityAt on save
ticketSchema.pre('save', function (next) {
  if (this.isModified('status') || this.isModified('comments')) {
    this.lastActivityAt = new Date();
  }
  next();
});

// Static method to get next ticket number for a project
ticketSchema.statics.getNextTicketNumber = async function (
  projectId: mongoose.Types.ObjectId
): Promise<number> {
  const lastTicket = await this.findOne({ projectId })
    .sort({ ticketNumber: -1 })
    .select('ticketNumber');
  
  return lastTicket ? lastTicket.ticketNumber + 1 : 1;
};

export const Ticket = mongoose.model<ITicket>('Ticket', ticketSchema);