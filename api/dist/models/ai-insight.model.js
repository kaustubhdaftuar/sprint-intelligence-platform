"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIInsight = exports.InsightType = void 0;
const mongoose_1 = __importStar(require("mongoose"));
var InsightType;
(function (InsightType) {
    InsightType["SPRINT_PLAN"] = "sprint_plan";
    InsightType["BLOCKER_DETECTION"] = "blocker_detection";
    InsightType["RISK_ASSESSMENT"] = "risk_assessment";
    InsightType["PRIORITY_SUGGESTION"] = "priority_suggestion";
    InsightType["TASK_SUMMARY"] = "task_summary";
})(InsightType || (exports.InsightType = InsightType = {}));
const recommendationSchema = new mongoose_1.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
    },
    actionable: { type: Boolean, default: true },
    metadata: { type: mongoose_1.Schema.Types.Mixed },
}, { _id: false });
const aiInsightSchema = new mongoose_1.Schema({
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
        type: mongoose_1.Schema.Types.ObjectId,
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
        type: mongoose_1.Schema.Types.Mixed,
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
}, {
    timestamps: true,
});
// Indexes
aiInsightSchema.index({ entityId: 1, type: 1 });
aiInsightSchema.index({ entityType: 1, entityId: 1 });
aiInsightSchema.index({ type: 1, isActive: 1 });
aiInsightSchema.index({ createdAt: 1 });
aiInsightSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
exports.AIInsight = mongoose_1.default.model('AIInsight', aiInsightSchema);
