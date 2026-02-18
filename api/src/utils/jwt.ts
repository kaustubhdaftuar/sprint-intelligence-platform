import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { env } from '@/utils/env';
import type { JwtAccessPayload, JwtRefreshPayload } from '@/types/auth.types';
import type { UserRole } from '@/types/auth.types';


/**
 * JWTUtils — token generation and verification.
 *
 * Design decisions:
 * - Access and refresh tokens use DIFFERENT secrets (env.JWT_ACCESS_SECRET
 *   vs env.JWT_REFRESH_SECRET). If the access secret leaks, refresh tokens
 *   remain secure.
 * - Payload shape matches auth.types.ts — no duplication, single source of truth.
 * - All methods are static — no state, no instantiation needed.
 */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class JWTUtils {
  static verifyToken(token: string) {
    return this.verifyAccessToken(token);
  }
  /**
   * Generate access token (short-lived, default 15m).
   * Signed with JWT_ACCESS_SECRET.
   */
  static generateAccessToken(payload: Omit<JwtAccessPayload, 'iat' | 'exp'>): string {
    const options: SignOptions = {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn']
    };

    return jwt.sign(payload, env.JWT_ACCESS_SECRET, options);
  }

  /**
   * Generate refresh token (long-lived, default 7d).
   * Signed with JWT_REFRESH_SECRET — separate from access token secret.
   */
  static generateRefreshToken(payload: Omit<JwtRefreshPayload, 'iat' | 'exp'>): string {
    const options: SignOptions = {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn']
    };

    return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
  }

  /**
   * Generate both access and refresh tokens.
   * Called on login and on refresh token exchange.
   */
  static generateTokenPair(userId: string, role: UserRole): TokenPair {
    return {
      accessToken: this.generateAccessToken({ sub: userId, role }),
      refreshToken: this.generateRefreshToken({ sub: userId }),
    };
  }

  /**
   * Verify access token.
   * Throws if token is expired, invalid, or malformed.
   */
  static verifyAccessToken(token: string): JwtAccessPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
      return decoded as JwtAccessPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Access token has expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid access token');
      }
      throw new Error('Access token verification failed');
    }
  }

  /**
   * Verify refresh token.
   * Uses the separate JWT_REFRESH_SECRET.
   */
  static verifyRefreshToken(token: string): JwtRefreshPayload {
    try {
      const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
      return decoded as JwtRefreshPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Refresh token has expired');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid refresh token');
      }
      throw new Error('Refresh token verification failed');
    }
  }

  /**
   * Decode token without verification (for debugging only).
   * Never use this for authentication — always verify first.
   */
  static decodeToken(token: string): JwtPayload | null {
    return jwt.decode(token) as JwtPayload | null;
  }

  /**
   * Extract token from Authorization header.
   * Expects: "Bearer <token>"
   * Returns the token string or null if header is malformed.
   */
  static extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7); // Strip "Bearer " prefix
  }
}