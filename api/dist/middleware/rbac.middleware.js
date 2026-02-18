"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = authorize;
const app_errors_1 = require("../errors/app.errors");
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
function authorize(...allowedRoles) {
    return (req, _res, next) => {
        // Guard: authenticate middleware must have run first
        if (!req.user) {
            return next(new app_errors_1.InternalError('authorize() called without authenticate() — check route wiring'));
        }
        if (!allowedRoles.includes(req.user.role)) {
            return next(new app_errors_1.ForbiddenError(`Role '${req.user.role}' is not permitted to access this resource. ` +
                `Required: ${allowedRoles.join(' or ')}.`));
        }
        next();
    };
}
