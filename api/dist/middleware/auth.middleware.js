"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuthenticate = exports.authorize = exports.authenticate = void 0;
const jwt_1 = require("../utils/jwt");
const user_model_1 = require("../models/user.model");
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * Authenticate using access token
 */
const authenticate = async (req, res, next) => {
    try {
        const token = jwt_1.JWTUtils.extractTokenFromHeader(req.headers.authorization);
        if (!token) {
            res.status(401).json({
                success: false,
                message: 'Authentication required',
            });
            return;
        }
        // Use verifyAccessToken (not verifyToken if you want strictness)
        const payload = jwt_1.JWTUtils.verifyAccessToken(token);
        // payload.sub is userId
        const user = await user_model_1.User.findById(payload.sub).select('isActive');
        if (!user || !user.isActive) {
            res.status(401).json({
                success: false,
                message: 'User not found or inactive',
            });
            return;
        }
        req.user = payload;
        next();
    }
    catch (error) {
        const err = error;
        logger_1.default.error({ err }, 'Authentication error');
        res.status(401).json({
            success: false,
            message: err.message || 'Invalid or expired token',
        });
    }
};
exports.authenticate = authenticate;
/**
 * Role-based authorization
 */
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Authentication required',
            });
            return;
        }
        if (!allowedRoles.includes(req.user.role)) {
            logger_1.default.warn({
                userId: req.user.sub,
                role: req.user.role,
            }, 'Unauthorized access attempt');
            res.status(403).json({
                success: false,
                message: 'Insufficient permissions',
            });
            return;
        }
        next();
    };
};
exports.authorize = authorize;
/**
 * Optional authentication
 */
const optionalAuthenticate = async (req, _res, next) => {
    try {
        const token = jwt_1.JWTUtils.extractTokenFromHeader(req.headers.authorization);
        if (token) {
            const payload = jwt_1.JWTUtils.verifyAccessToken(token);
            req.user = payload;
        }
        next();
    }
    catch {
        next();
    }
};
exports.optionalAuthenticate = optionalAuthenticate;
