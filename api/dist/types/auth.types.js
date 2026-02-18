"use strict";
/**
 * Auth types — single source of truth.
 *
 * UserRole is a string literal union (not an enum) so it composes cleanly
 * with Zod's z.enum() and avoids the TypeScript enum pitfalls (reverse
 * mapping, const enum issues with isolatedModules, etc.).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_ROLES = void 0;
exports.USER_ROLES = ['admin', 'manager', 'developer'];
