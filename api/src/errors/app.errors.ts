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

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly isOperational: boolean;

  constructor(message: string, isOperational = true) {
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

// ─── 400 Bad Request ──────────────────────────────────────────────────────────

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';
  // details carries the Zod issue array for structured field-level errors
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

// ─── 401 Unauthorized ─────────────────────────────────────────────────────────

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORIZED';
  constructor(message = 'Authentication required') {
    super(message);
  }
}

// ─── 403 Forbidden ────────────────────────────────────────────────────────────

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';
  constructor(message = 'You do not have permission to perform this action') {
    super(message);
  }
}

// ─── 404 Not Found ────────────────────────────────────────────────────────────

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';
  constructor(resource: string, id?: string) {
    super(id ? `${resource} with id '${id}' was not found` : `${resource} not found`);
  }
}

// ─── 409 Conflict ─────────────────────────────────────────────────────────────

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';
  constructor(message: string) {
    super(message);
  }
}

// ─── 422 Unprocessable Entity ─────────────────────────────────────────────────
// Use for business rule violations that aren't validation errors
// e.g. "Cannot activate sprint — another sprint is already active"

export class BusinessRuleError extends AppError {
  readonly statusCode = 422;
  readonly code = 'BUSINESS_RULE_VIOLATION';
  constructor(message: string) {
    super(message);
  }
}

// ─── 429 Too Many Requests ────────────────────────────────────────────────────

export class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly code = 'RATE_LIMITED';
  constructor(message = 'Too many requests — please slow down') {
    super(message);
  }
}

// ─── 500 Internal Server Error ────────────────────────────────────────────────
// isOperational = false → these are programming errors, not client mistakes

export class InternalError extends AppError {
  readonly statusCode = 500;
  readonly code = 'INTERNAL_ERROR';
  constructor(message = 'An unexpected error occurred') {
    // isOperational: false — triggers error-level logging + alerts
    super(message, false);
  }
}

// ─── Type guard ───────────────────────────────────────────────────────────────

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}