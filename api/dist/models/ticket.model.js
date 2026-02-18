"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ticket = exports.STORY_POINT_VALUES = exports.TICKET_TYPE_VALUES = exports.TICKET_PRIORITY_VALUES = exports.TICKET_STATUS_VALUES = void 0;
const mongoose_1 = require("mongoose");
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
exports.TICKET_STATUS_VALUES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
/**
 * Ticket priority — UPPERCASE, matches shared.validators.ts TICKET_PRIORITIES.
 * aiSuggestions.priority also uses this type — AI service writes UPPERCASE values.
 */
exports.TICKET_PRIORITY_VALUES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
/**
 * Ticket type — story/bug/task/epic.
 * No state machine on type — it can be changed freely.
 */
exports.TICKET_TYPE_VALUES = ['STORY', 'BUG', 'TASK', 'EPIC'];
/**
 * Valid Fibonacci story points.
 * Enforced at both API layer (Zod) and DB layer (enum) so worker/AI
 * service writes are also constrained.
 */
exports.STORY_POINT_VALUES = [1, 2, 3, 5, 8, 13, 21];
// ─── Subschemas ───────────────────────────────────────────────────────────────
const CommentSchema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });
const AISuggestionsSchema = new mongoose_1.Schema({
    priority: { type: String, enum: exports.TICKET_PRIORITY_VALUES },
    estimatedHours: { type: Number, min: 0 },
    similarTickets: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'Ticket' }],
    summary: { type: String, maxlength: 1000 },
}, { _id: false });
// ─── Main Schema ──────────────────────────────────────────────────────────────
const TicketSchema = new mongoose_1.Schema({
    projectId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Project',
        required: true,
    },
    sprintId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Sprint',
        default: undefined, // Explicit undefined = backlog
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
        enum: exports.TICKET_TYPE_VALUES,
        default: 'TASK',
    },
    status: {
        type: String,
        enum: exports.TICKET_STATUS_VALUES,
        default: 'TODO',
    },
    priority: {
        type: String,
        enum: exports.TICKET_PRIORITY_VALUES,
        default: 'MEDIUM',
    },
    storyPoints: {
        type: Number,
        enum: exports.STORY_POINT_VALUES, // DB-level Fibonacci enforcement
    },
    assignedTo: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        default: undefined,
    },
    reporterId: {
        type: mongoose_1.Schema.Types.ObjectId,
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
        index: true, // Worker queries: all blocked tickets in a project
    },
    blockedReason: {
        type: String,
        maxlength: 500,
    },
    aiSuggestions: {
        type: AISuggestionsSchema,
    },
}, {
    timestamps: true,
    versionKey: false,
    toJSON: {
        transform: (_doc, ret) => {
            ret.id = ret._id.toString();
            delete ret._id;
        },
    },
});
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
exports.Ticket = (0, mongoose_1.model)('Ticket', TicketSchema);
