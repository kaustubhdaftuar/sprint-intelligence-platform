import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import config from '../config/config';
import { UserRole } from '../models/User';

export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class JWTUtils {
  /**
   * Generate access token (short-lived)
   */
  static generateAccessToken(
    payload: Omit<JWTPayload, 'iat' | 'exp'>
  ): string {
    const options: SignOptions = {
      expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
    };

    return jwt.sign(
      payload,
      config.jwtSecret as string,
      options
    );
  }

  /**
   * Generate refresh token (long-lived)
   */
  static generateRefreshToken(
    payload: Omit<JWTPayload, 'iat' | 'exp'>
  ): string {
    const options: SignOptions = {
      expiresIn: config.jwtRefreshExpiresIn as SignOptions['expiresIn'],
    };

    return jwt.sign(
      payload,
      config.jwtSecret as string,
      options
    );
  }

  /**
   * Generate both access and refresh tokens
   */
  static generateTokenPair(
    payload: Omit<JWTPayload, 'iat' | 'exp'>
  ): TokenPair {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  }

  /**
   * Verify and decode token
   */
  static verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(
        token,
        config.jwtSecret as string
      ) as JwtPayload;

      return decoded as JWTPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token has expired');
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      }

      throw new Error('Token verification failed');
    }
  }

  /**
   * Decode token without verification (for debugging)
   */
  static decodeToken(token: string): JWTPayload | null {
    return jwt.decode(token) as JWTPayload | null;
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.substring(7);
  }
}
