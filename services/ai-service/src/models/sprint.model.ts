import { Schema, model, Types } from 'mongoose';

/**
 * Minimal Sprint model for AI service.
 * Only includes fields needed for AI analysis.
 */

interface ISprint {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  name: string;
  status: string;
  startDate: Date;
  endDate: Date;
  capacityPoints: number;
  velocityTarget?: number;
  actualVelocity?: number;
  riskScore?: number;
}

const SprintSchema = new Schema<ISprint>({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  name: { type: String, required: true },
  status: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  capacityPoints: { type: Number, default: 0 },
  velocityTarget: { type: Number },
  actualVelocity: { type: Number },
  riskScore: { type: Number },
});

export const Sprint = model<ISprint>('Sprint', SprintSchema);