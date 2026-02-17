import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, InternalError } from '@/errors/app.errors';
import type { UserRole } from '@/types/auth.types';

/**
 * Authorize middleware — must always be used AFTER authenticate middleware.
 *
 * Usage:
 *   router.post('/sprints', authenticate, authorize('manager', 'admin'), createSprint)
 *
 * Design notes:
 * - If req.user is absent, the route was wired without authenticate — this is
 *   a programming error, not a client error. Throw 500, not 401.
 * - Role check is case-insensitive-safe because roles are stored as lowercase
 *   string literals in the DB and validated via Zod enum on registration.
 * - Returns 403 Forbidden (authenticated but not authorized), never 401.
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Guard: authenticate middleware must have run first
    if (!req.user) {
      return next(
        new InternalError(
          'authorize() called without authenticate() — check route wiring',
        ),
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Role '${req.user.role}' is not permitted to access this resource. ` +
            `Required: ${allowedRoles.join(' or ')}.`,
        ),
      );
    }

    next();
  };
}