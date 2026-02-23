import { Schema, model, Types } from 'mongoose';

/**
 * Minimal Ticket model for AI service.
 */

interface ITicket {
  _id: Types.ObjectId;
  sprintId?: Types.ObjectId;
  title: string;
  status: string;
  storyPoints?: number;
  isBlocked: boolean;
}

const TicketSchema = new Schema<ITicket>({
  sprintId: { type: Schema.Types.ObjectId, ref: 'Sprint' },
  title: { type: String, required: true },
  status: { type: String, required: true },
  storyPoints: { type: Number },
  isBlocked: { type: Boolean, default: false },
});

export const Ticket = model<ITicket>('Ticket', TicketSchema);