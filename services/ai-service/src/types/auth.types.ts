/**
 * Auth types — single source of truth.
 *
 * UserRole is a string literal union (not an enum) so it composes cleanly
 * with Zod's z.enum() and avoids the TypeScript enum pitfalls (reverse
 * mapping, const enum issues with isolatedModules, etc.).
 */

export type UserRole = 'admin' | 'manager' | 'developer' | 'user';

export const USER_ROLES: readonly UserRole[] = ['admin', 'manager', 'developer'] as const;

/**
 * The payload encoded inside the JWT access token.
 * Keep it minimal — only data needed for auth/authz decisions.
 * Never put sensitive data (password hash, email) in a JWT.
 */
export interface JwtAccessPayload {
  sub: string;     // MongoDB ObjectId as string (user._id)
  role: UserRole;
  // iat and exp are added by jsonwebtoken automatically
}

/**
 * Refresh token payload — only the subject is needed.
 * A separate secret signs refresh tokens so a compromised access secret
 * doesn't allow minting refresh tokens.
 */
export interface JwtRefreshPayload {
  sub: string;
}

/**
 * The shape attached to req.user by the authenticate middleware.
 * Downstream middleware and controllers can safely read this without
 * null checks once authenticate has run.
 */
export interface AuthenticatedUser {
  id: string;       // Normalized from JWT sub
  role: UserRole;
}

// Augment Express's Request type so req.user is typed project-wide.
// This file must be imported (directly or transitively) before any
// middleware or controller that reads req.user.
declare global {
  namespace Express {
    interface Request {
      _user?: AuthenticatedUser;
      correlationId?: string;
    }
  }
}