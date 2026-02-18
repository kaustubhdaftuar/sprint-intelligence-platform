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
exports.ticketRepository = exports.TicketRepository = void 0;
const ticket_model_1 = require("../models/ticket.model");
const mongodb_1 = require("mongodb");
class TicketRepository {
    /**
     * Get next ticket number for a project using atomic $inc.
     * Uses a counters collection to avoid race conditions.
     * findOneAndUpdate with upsert:true creates the counter on first use.
     *
     * Returns the new sequence number (already incremented).
     */
    async getNextTicketNumber(projectId) {
        const { default: mongoose } = await Promise.resolve().then(() => __importStar(require('mongoose')));
        const db = mongoose.connection.db;
        if (!db)
            throw new Error('Database connection not established');
        const result = await db.collection('counters').findOneAndUpdate({ _id: new mongodb_1.ObjectId(projectId.toString()) }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
        if (!result || !result.value) {
            return 1;
        }
        return result.value.seq;
    }
    async create(data) {
        const ticket = new ticket_model_1.Ticket(data);
        return ticket.save();
    }
    async findById(id) {
        return ticket_model_1.Ticket.findById(id).lean().exec();
    }
    /**
     * Find multiple tickets by their IDs.
     * Used by sprint service to validate bulk assignment.
     * Returns only found tickets — caller checks length vs input length.
     */
    async findManyByIds(ids) {
        return ticket_model_1.Ticket.find({ _id: { $in: ids } })
            .lean()
            .exec();
    }
    /**
     * List tickets with flexible filtering.
     * backlog = sprintId does not exist on document.
     */
    async findMany(filter, skip, limit) {
        const query = this.buildFilter(filter);
        return ticket_model_1.Ticket.find(query)
            .sort({ priority: 1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
            .exec();
    }
    async countMany(filter) {
        const query = this.buildFilter(filter);
        return ticket_model_1.Ticket.countDocuments(query);
    }
    /**
     * Find all tickets in a sprint with a specific status.
     * Called by sprint.service.completeSprint to compute actualVelocity.
     */
    async findBySprintAndStatus(sprintId, status) {
        return ticket_model_1.Ticket.find({ sprintId, status })
            .lean()
            .exec();
    }
    /**
     * Update ticket fields. Returns updated document.
     * Does NOT trigger pre-save hook — do not use for status changes.
     * For null values (unassign, remove dueDate), $unset is used.
     */
    async update(id, data) {
        const setFields = {};
        const unsetFields = {};
        for (const [key, value] of Object.entries(data)) {
            if (value === null) {
                unsetFields[key] = '';
            }
            else if (value !== undefined) {
                setFields[key] = value;
            }
        }
        const updateOp = {};
        if (Object.keys(setFields).length)
            updateOp['$set'] = setFields;
        if (Object.keys(unsetFields).length)
            updateOp['$unset'] = unsetFields;
        if (!Object.keys(updateOp).length)
            return this.findById(id);
        return ticket_model_1.Ticket.findByIdAndUpdate(id, updateOp, {
            new: true,
            runValidators: true,
        })
            .lean()
            .exec();
    }
    /**
     * Transition ticket status.
     * Uses findById + save() to trigger the pre-save hook,
     * which updates lastActivityAt on status change.
     *
     * Returns null if ticket not found.
     */
    async setStatus(id, status) {
        const ticket = await ticket_model_1.Ticket.findById(id);
        if (!ticket)
            return null;
        ticket.status = status;
        // pre-save hook fires here and sets lastActivityAt = new Date()
        const saved = await ticket.save();
        return saved.toObject();
    }
    /**
     * Set isBlocked flag. Written by worker service during blocker detection.
     * Does not change status — isBlocked is orthogonal to status.
     */
    async setBlocked(id, isBlocked, blockedReason) {
        const updateOp = {
            $set: { isBlocked, lastActivityAt: new Date() },
        };
        if (!isBlocked) {
            updateOp['$unset'] = { blockedReason: '' };
        }
        else if (blockedReason) {
            updateOp['$set']['blockedReason'] = blockedReason;
        }
        await ticket_model_1.Ticket.findByIdAndUpdate(id, updateOp);
    }
    /**
     * Add a comment to a ticket.
     * Uses $push to append to the embedded comments array.
     * Also updates lastActivityAt (pre-save hook doesn't fire on updateOne —
     * we set it explicitly here).
     */
    async addComment(id, comment) {
        return ticket_model_1.Ticket.findByIdAndUpdate(id, {
            $push: { comments: { ...comment, createdAt: new Date() } },
            $set: { lastActivityAt: new Date() },
        }, { new: true })
            .lean()
            .exec();
    }
    /**
     * Assign a batch of tickets to a sprint.
     * Returns the total story points of newly assigned tickets
     * so the caller can update sprint.capacityPoints atomically.
     *
     * Only assigns tickets not already in this sprint (idempotent).
     * Tickets already in another sprint are moved — caller should validate
     * this is intentional (service layer responsibility).
     */
    async assignToSprint(ticketIds, sprintId) {
        // Fetch before update to know current state (for point delta calculation)
        const tickets = await ticket_model_1.Ticket.find({ _id: { $in: ticketIds } })
            .select('storyPoints sprintId')
            .lean()
            .exec();
        // Only count points for tickets not already in THIS sprint
        const pointsDelta = tickets
            .filter((t) => t.sprintId?.toString() !== sprintId.toString())
            .reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
        await ticket_model_1.Ticket.updateMany({ _id: { $in: ticketIds } }, { $set: { sprintId, status: 'TODO' } });
        return pointsDelta;
    }
    /**
     * Remove a single ticket from a sprint (back to backlog).
     * Returns the ticket's story points so sprint.capacityPoints
     * can be decremented by the caller.
     */
    async removeFromSprint(ticketId, sprintId) {
        const ticket = await ticket_model_1.Ticket.findOne({ _id: ticketId, sprintId })
            .select('storyPoints')
            .lean()
            .exec();
        if (!ticket)
            return 0;
        await ticket_model_1.Ticket.findByIdAndUpdate(ticketId, {
            $unset: { sprintId: '' },
            $set: { status: 'TODO' },
        });
        return ticket.storyPoints ?? 0;
    }
    /**
     * Find tickets inactive beyond a cutoff date that are in an active sprint.
     * Called by the worker service blocker detection sweep.
     *
     * Query uses the compound index: { lastActivityAt: 1, sprintId: 1 }
     */
    async findStaleSprintTickets(cutoffDate, projectId) {
        const filter = {
            lastActivityAt: { $lt: cutoffDate },
            sprintId: { $exists: true },
            status: { $nin: ['DONE'] },
            isBlocked: false, // Don't re-flag already blocked tickets
        };
        if (projectId)
            filter['projectId'] = projectId;
        return ticket_model_1.Ticket.find(filter).lean().exec();
    }
    /**
     * Set AI suggestions on a ticket.
     * Called by AI service after generating priority suggestions.
     */
    async setAISuggestions(id, suggestions) {
        await ticket_model_1.Ticket.findByIdAndUpdate(id, {
            $set: { aiSuggestions: suggestions },
        });
    }
    async delete(id) {
        const result = await ticket_model_1.Ticket.findByIdAndDelete(id);
        return result !== null;
    }
    // ─── Private helpers ────────────────────────────────────────────────────────
    buildFilter(filter) {
        const query = {
            projectId: filter.projectId,
        };
        if (filter.sprintId) {
            query['sprintId'] = filter.sprintId;
        }
        else if (filter.noSprint) {
            query['sprintId'] = { $exists: false };
        }
        if (filter.status)
            query['status'] = filter.status;
        if (filter.assignedTo)
            query['assignedTo'] = filter.assignedTo;
        if (filter.priority)
            query['priority'] = filter.priority;
        if (filter.isBlocked !== undefined)
            query['isBlocked'] = filter.isBlocked;
        return query;
    }
}
exports.TicketRepository = TicketRepository;
exports.ticketRepository = new TicketRepository();
