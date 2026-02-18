"use strict";
/**
 * Custom error hierarchy.
 *
 * Design principles:
 * - AppError is the base — all thrown errors in this codebase extend it.
 * - `isOperational: true` means the error is expected (client mistake, not found, etc.)
 *   The error handler uses this flag to decide whether to log at warn vs error level
 *   and whether to include debug detail.
 * - `isOperational: false` means it's a programming error or unexpected failure —
 *   log at error level, alert ops.
 * - Never put stack traces in HTTP responses — only in server-side structured logs.
 * - The error handler reads `statusCode` and `code` to build the response shape.
 *
 * Error response shape (enforced by error handler, not here):
 *   { success: false, error: { code: string, message: string, details?: unknown } }
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalError = exports.RateLimitError = exports.BusinessRuleError = exports.ConflictError = exports.NotFoundError = exports.ForbiddenError = exports.UnauthorizedError = exports.ValidationError = exports.AppError = void 0;
exports.isAppError = isAppError;
class AppError extends Error {
    constructor(message, isOperational = true) {
        super(message);
        this.isOperational = isOperational;
        // Restore prototype chain broken by extending Error in TypeScript
        Object.setPrototypeOf(this, new.target.prototype);
        // Capture stack trace (V8 only, no-op elsewhere)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
exports.AppError = AppError;
// ─── 400 Bad Request ──────────────────────────────────────────────────────────
class ValidationError extends AppError {
    // details carries the Zod issue array for structured field-level errors
    constructor(message, details) {
        super(message);
        this.details = details;
        this.statusCode = 400;
        this.code = 'VALIDATION_ERROR';
    }
}
exports.ValidationError = ValidationError;
// ─── 401 Unauthorized ─────────────────────────────────────────────────────────
class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required') {
        super(message);
        this.statusCode = 401;
        this.code = 'UNAUTHORIZED';
    }
}
exports.UnauthorizedError = UnauthorizedError;
// ─── 403 Forbidden ────────────────────────────────────────────────────────────
class ForbiddenError extends AppError {
    constructor(message = 'You do not have permission to perform this action') {
        super(message);
        this.statusCode = 403;
        this.code = 'FORBIDDEN';
    }
}
exports.ForbiddenError = ForbiddenError;
// ─── 404 Not Found ────────────────────────────────────────────────────────────
class NotFoundError extends AppError {
    constructor(resource, id) {
        super(id ? `${resource} with id '${id}' was not found` : `${resource} not found`);
        this.statusCode = 404;
        this.code = 'NOT_FOUND';
    }
}
exports.NotFoundError = NotFoundError;
// ─── 409 Conflict ─────────────────────────────────────────────────────────────
class ConflictError extends AppError {
    constructor(message) {
        super(message);
        this.statusCode = 409;
        this.code = 'CONFLICT';
    }
}
exports.ConflictError = ConflictError;
// ─── 422 Unprocessable Entity ─────────────────────────────────────────────────
// Use for business rule violations that aren't validation errors
// e.g. "Cannot activate sprint — another sprint is already active"
class BusinessRuleError extends AppError {
    constructor(message) {
        super(message);
        this.statusCode = 422;
        this.code = 'BUSINESS_RULE_VIOLATION';
    }
}
exports.BusinessRuleError = BusinessRuleError;
// ─── 429 Too Many Requests ────────────────────────────────────────────────────
class RateLimitError extends AppError {
    constructor(message = 'Too many requests — please slow down') {
        super(message);
        this.statusCode = 429;
        this.code = 'RATE_LIMITED';
    }
}
exports.RateLimitError = RateLimitError;
// ─── 500 Internal Server Error ────────────────────────────────────────────────
// isOperational = false → these are programming errors, not client mistakes
class InternalError extends AppError {
    constructor(message = 'An unexpected error occurred') {
        // isOperational: false — triggers error-level logging + alerts
        super(message, false);
        this.statusCode = 500;
        this.code = 'INTERNAL_ERROR';
    }
}
exports.InternalError = InternalError;
// ─── Type guard ───────────────────────────────────────────────────────────────
function isAppError(err) {
    return err instanceof AppError;
}
