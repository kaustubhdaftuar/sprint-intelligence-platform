"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const auth_service_1 = require("../services/auth.service");
const errorHandler_1 = require("../middleware/errorHandler");
const joi_1 = __importDefault(require("joi"));
const user_model_1 = require("../models/user.model");
class AuthController {
    constructor() {
        /**
         * Register new user
         * POST /api/auth/register
         */
        this.register = (0, errorHandler_1.asyncHandler)(async (req, res) => {
            // Validation schema
            const schema = joi_1.default.object({
                email: joi_1.default.string().email().required(),
                password: joi_1.default.string().min(8).required(),
                name: joi_1.default.string().min(2).required(),
                role: joi_1.default.string().valid(...Object.values(user_model_1.UserRole)).optional(),
            });
            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    message: error.details[0].message,
                });
                return;
            }
            const result = await this.authService.register(value);
            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: result,
            });
        });
        /**
         * Login user
         * POST /api/auth/login
         */
        this.login = (0, errorHandler_1.asyncHandler)(async (req, res) => {
            const schema = joi_1.default.object({
                email: joi_1.default.string().email().required(),
                password: joi_1.default.string().required(),
            });
            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    message: error.details[0].message,
                });
                return;
            }
            const result = await this.authService.login(value.email, value.password);
            res.status(200).json({
                success: true,
                message: 'Login successful',
                data: result,
            });
        });
        /**
         * Refresh access token
         * POST /api/auth/refresh
         */
        this.refreshToken = (0, errorHandler_1.asyncHandler)(async (req, res) => {
            const schema = joi_1.default.object({
                refreshToken: joi_1.default.string().required(),
            });
            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    message: error.details[0].message,
                });
                return;
            }
            const tokens = await this.authService.refreshToken(value.refreshToken);
            res.status(200).json({
                success: true,
                message: 'Token refreshed successfully',
                data: { tokens },
            });
        });
        /**
         * Get current user profile
         * GET /api/auth/me
         */
        this.getProfile = (0, errorHandler_1.asyncHandler)(async (req, res) => {
            const user = await this.authService.getProfile(req._user.id);
            res.status(200).json({
                success: true,
                data: { user },
            });
        });
        /**
         * Update user profile
         * PUT /api/auth/profile
         */
        this.updateProfile = (0, errorHandler_1.asyncHandler)(async (req, res) => {
            const schema = joi_1.default.object({
                name: joi_1.default.string().min(2).optional(),
                email: joi_1.default.string().email().optional(),
            });
            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    message: error.details[0].message,
                });
                return;
            }
            const user = await this.authService.updateProfile(req._user.id, value);
            res.status(200).json({
                success: true,
                message: 'Profile updated successfully',
                data: { user },
            });
        });
        /**
         * Change password
         * POST /api/auth/change-password
         */
        this.changePassword = (0, errorHandler_1.asyncHandler)(async (req, res) => {
            const schema = joi_1.default.object({
                currentPassword: joi_1.default.string().required(),
                newPassword: joi_1.default.string().min(8).required(),
            });
            const { error, value } = schema.validate(req.body);
            if (error) {
                res.status(400).json({
                    success: false,
                    message: error.details[0].message,
                });
                return;
            }
            await this.authService.changePassword(req._user.id, value.currentPassword, value.newPassword);
            res.status(200).json({
                success: true,
                message: 'Password changed successfully',
            });
        });
        this.authService = new auth_service_1.AuthService();
    }
}
exports.AuthController = AuthController;
