import mongoose, { Document, Schema } from 'mongoose';

export enum InsightType {
  SPRINT_PLAN = 'sprint_plan',
  BLOCKER_DETECTION = 'blocker_detection',
  RISK_ASSESSMENT = 'risk_assessment',
  PRIORITY_SUGGESTION = 'priority_suggestion',
  TASK_SUMMARY = 'task_summary',
}

export interface IRecommendation {
  title: string;
  description: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  actionable: boolean;
  metadata?: Record<string, any>;
}

export interface IAIInsight extends Document {
  type: InsightType;
  entityType: 'project' | 'sprint' | 'ticket';
  entityId: mongoose.Types.ObjectId;
  recommendations: IRecommendation[];
  score?: number; // 0-100
  confidence?: number; // 0-1
  metadata: Record<string, any>;
  isActive: boolean;
  expiresAt?: Date;
  createdBy: 'system' | 'user';
  createdAt: Date;
  updatedAt: Date;
}

const recommendationSchema = new Schema<IRecommendation>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
    },
    actionable: { type: Boolean, default: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const aiInsightSchema = new Schema<IAIInsight>(
  {
    type: {
      type: String,
      enum: Object.values(InsightType),
      required: true,
    },
    entityType: {
      type: String,
      enum: ['project', 'sprint', 'ticket'],
      required: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: 'entityType',
    },
    recommendations: [recommendationSchema],
    score: {
      type: Number,
      min: 0,
      max: 100,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    expiresAt: Date,
    createdBy: {
      type: String,
      enum: ['system', 'user'],
      default: 'system',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
aiInsightSchema.index({ entityId: 1, type: 1 });
aiInsightSchema.index({ entityType: 1, entityId: 1 });
aiInsightSchema.index({ type: 1, isActive: 1 });
aiInsightSchema.index({ createdAt: 1 });
aiInsightSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

export const AIInsight = mongoose.model<IAIInsight>('AIInsight', aiInsightSchema);