"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = exports.asyncHandler = exports.errorHandler = exports.AppError = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
class AppError extends Error {
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, _next) => {
    const error = err; // ✅ correct placement
    let statusCode = 500;
    let message = 'Internal server error';
    let isOperational = false;
    if (err instanceof AppError) {
        statusCode = err.statusCode;
        message = err.message;
        isOperational = err.isOperational;
    }
    else if (err.name === 'ValidationError') {
        statusCode = 400;
        message = err.message;
        isOperational = true;
    }
    else if (err.name === 'CastError') {
        statusCode = 400;
        message = 'Invalid ID format';
        isOperational = true;
    }
    else if (err.code === 11000) {
        statusCode = 409;
        message = 'Duplicate key error';
        isOperational = true;
    }
    // Log error (Pino expects object first)
    if (!isOperational || statusCode >= 500) {
        logger_1.default.error({
            message: error.message,
            stack: error.stack,
            statusCode,
            path: req.path,
            method: req.method,
        }, 'Error');
    }
    else {
        logger_1.default.warn({
            message: error.message,
            statusCode,
            path: req.path,
        }, 'Operational error');
    }
    // Send response
    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && {
            stack: error.stack,
        }),
    });
};
exports.errorHandler = errorHandler;
/**
 * Async handler wrapper
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
/**
 * 404 handler
 */
const notFoundHandler = (req, _res, next) => {
    const error = new AppError(`Route ${req.originalUrl} not found`, 404);
    next(error);
};
exports.notFoundHandler = notFoundHandler;
