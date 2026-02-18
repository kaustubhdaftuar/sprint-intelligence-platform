"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const user_repository_1 = require("../repositories/user.repository");
const jwt_1 = require("../utils/jwt");
const errorHandler_1 = require("../middleware/errorHandler");
const logger_1 = __importDefault(require("../utils/logger"));
class AuthService {
    constructor() {
        this.userRepository = new user_repository_1.UserRepository();
    }
    /**
     * Register a new user
     */
    async register(userData) {
        // Check if email already exists
        const existingUser = await this.userRepository.findByEmail(userData.email);
        if (existingUser) {
            throw new errorHandler_1.AppError('Email already registered', 409);
        }
        // Create user
        const user = await this.userRepository.create(userData);
        // Generate tokens
        const tokens = jwt_1.JWTUtils.generateTokenPair(user._id.toString(), user.role);
        logger_1.default.info(`New user registered: ${user.email}`);
        return {
            user: user.toJSON(),
            tokens,
        };
    }
    /**
     * Login user
     */
    async login(email, password) {
        // Find user with password field
        const user = await this.userRepository.findByEmail(email);
        if (!user) {
            throw new errorHandler_1.AppError('Invalid email or password', 401);
        }
        // Check if user is active
        if (!user.isActive) {
            throw new errorHandler_1.AppError('Account is deactivated', 403);
        }
        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            throw new errorHandler_1.AppError('Invalid email or password', 401);
        }
        // Generate tokens
        const tokens = jwt_1.JWTUtils.generateTokenPair(user._id.toString(), user.role);
        logger_1.default.info(`User logged in: ${user.email}`);
        return {
            user: user.toJSON(),
            tokens,
        };
    }
    /**
     * Refresh access token
     */
    async refreshToken(refreshToken) {
        try {
            // Verify refresh token
            const payload = jwt_1.JWTUtils.verifyRefreshToken(refreshToken);
            // Verify user still exists
            const user = await this.userRepository.findById(payload.sub);
            if (!user || !user.isActive) {
                throw new errorHandler_1.AppError('User not found or inactive', 401);
            }
            // Generate new token pair
            const tokens = jwt_1.JWTUtils.generateTokenPair(user._id.toString(), user.role);
            return tokens;
        }
        catch (error) {
            throw new errorHandler_1.AppError(error.message || 'Invalid refresh token', 401);
        }
    }
    /**
     * Get current user profile
     */
    async getProfile(userId) {
        const user = await this.userRepository.findById(userId);
        if (!user) {
            throw new errorHandler_1.AppError('User not found', 404);
        }
        return user.toJSON();
    }
    /**
     * Update user profile
     */
    async updateProfile(userId, updates) {
        // If email is being updated, check if it's already taken
        if (updates.email) {
            const existingUser = await this.userRepository.findByEmail(updates.email);
            if (existingUser && existingUser._id.toString() !== userId) {
                throw new errorHandler_1.AppError('Email already in use', 409);
            }
        }
        const user = await this.userRepository.update(userId, updates);
        if (!user) {
            throw new errorHandler_1.AppError('User not found', 404);
        }
        return user.toJSON();
    }
    /**
     * Change password
     */
    async changePassword(userId, currentPassword, newPassword) {
        const user = await this.userRepository.findByEmail((await this.userRepository.findById(userId))?.email || '');
        if (!user) {
            throw new errorHandler_1.AppError('User not found', 404);
        }
        // Verify current password
        const isValid = await user.comparePassword(currentPassword);
        if (!isValid) {
            throw new errorHandler_1.AppError('Current password is incorrect', 401);
        }
        // Update password
        user.password = newPassword;
        await user.save();
        logger_1.default.info(`Password changed for user: ${user.email}`);
    }
}
exports.AuthService = AuthService;
