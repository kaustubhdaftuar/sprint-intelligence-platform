"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const user_model_1 = require("../models/user.model");
class UserRepository {
    /**
     * Create a new user
     */
    async create(userData) {
        const user = new user_model_1.User(userData);
        return await user.save();
    }
    /**
     * Find user by email
     */
    async findByEmail(email) {
        return await user_model_1.User.findOne({ email }).select('+password');
    }
    /**
     * Find user by ID
     */
    async findById(id) {
        return await user_model_1.User.findById(id);
    }
    /**
     * Find all users with optional filters
     */
    async findAll(filters = {}) {
        return await user_model_1.User.find(filters);
    }
    /**
     * Update user
     */
    async update(id, updates) {
        return await user_model_1.User.findByIdAndUpdate(id, updates, {
            new: true,
            runValidators: true,
        });
    }
    /**
     * Delete user (soft delete by setting isActive to false)
     */
    async delete(id) {
        return await user_model_1.User.findByIdAndUpdate(id, { isActive: false }, { new: true });
    }
    /**
     * Check if email exists
     */
    async emailExists(email) {
        const count = await user_model_1.User.countDocuments({ email });
        return count > 0;
    }
    /**
     * Get user statistics
     */
    async getStats() {
        const [stats] = await user_model_1.User.aggregate([
            {
                $facet: {
                    total: [{ $count: 'count' }],
                    byRole: [
                        { $group: { _id: '$role', count: { $sum: 1 } } },
                    ],
                    active: [
                        { $match: { isActive: true } },
                        { $count: 'count' },
                    ],
                },
            },
        ]);
        return {
            total: stats.total[0]?.count || 0,
            byRole: stats.byRole.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            active: stats.active[0]?.count || 0,
        };
    }
}
exports.UserRepository = UserRepository;
