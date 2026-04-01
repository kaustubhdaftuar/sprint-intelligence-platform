import { Schema, model, Types } from 'mongoose';

/**
 * Ticket model for AI service — fields required for jobs that read/update tickets.
 * Must stay compatible with api/src/models/ticket.model.ts collection shape.
 */
interface ITicket {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  sprintId?: Types.ObjectId;
  key: string;
  title: string;
  status: string;
  storyPoints?: number;
  lastActivityAt: Date;
  isBlocked: boolean;
  blockedReason?: string;
}

const TicketSchema = new Schema<ITicket>(
  {
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    sprintId: { type: Schema.Types.ObjectId, ref: 'Sprint' },
    key: { type: String, required: true },
    title: { type: String, required: true },
    status: { type: String, required: true },
    storyPoints: { type: Number },
    lastActivityAt: { type: Date, default: Date.now },
    isBlocked: { type: Boolean, default: false },
    blockedReason: { type: String },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

export const Ticket = model<ITicket>('Ticket', TicketSchema);
