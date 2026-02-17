import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '@/errors/app.errors';

/**
 * Validation middleware factory.
 *
 * Usage:
 *   router.post('/projects', authenticate, validateBody(CreateProjectSchema), createProject)
 *
 * What it does:
 * - Parses req.body against the Zod schema
 * - Replaces req.body with the parsed result (coerced types, stripped unknown keys)
 * - On failure, calls next(ValidationError) with structured Zod issue details
 *
 * Why replace req.body:
 * - Downstream controllers receive TypeScript-safe, already-validated data
 * - No need for controllers to cast or re-validate
 * - Unknown fields are stripped automatically (Zod default: strip)
 *
 * Production concern:
 * - Zod's .parse() throws, .safeParse() returns a result — we use safeParse
 *   to avoid unhandled throw at middleware level
 * - We pass issues to ValidationError.details so the error handler can
 *   serialize them as structured field-level errors for clients
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(mapZodError(result.error));
    }
    // Safe: we validated above; replace with parsed (coerced + stripped) value
    req.body = result.data as typeof req.body;
    next();
  };
}

/**
 * Validates req.query against the schema.
 *
 * Note: Express parses all query params as strings. Your Zod schema
 * should use z.coerce.number() etc. for numeric query params.
 *
 * Usage:
 *   router.get('/tickets', authenticate, validateQuery(ListTicketsQuerySchema), listTickets)
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(mapZodError(result.error));
    }
    // Express types req.query as ParsedQs — cast is safe post-validation
    req.query = result.data as typeof req.query;
    next();
  };
}

/**
 * Validates req.params against the schema.
 *
 * Use for routes where params need coercion or format validation
 * (e.g. validating that :id is a valid MongoDB ObjectId string).
 *
 * Usage:
 *   router.get('/:id', authenticate, validateParams(IdParamSchema), getSprint)
 */
export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return next(mapZodError(result.error));
    }
    req.params = result.data as typeof req.params;
    next();
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Maps a ZodError to our ValidationError with structured issue details.
 * The error handler will serialize `details` for the client.
 */
function mapZodError(error: ZodError): ValidationError {
  const details = error.issues.map((issue) => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
    code: issue.code,
  }));

  // Human-readable summary as the top-level message
  const message =
    details.length === 1
      ? details[0].message
      : `${details.length} validation errors — see details`;

  return new ValidationError(message, details);
}