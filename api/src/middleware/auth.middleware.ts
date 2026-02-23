import { Request, Response, NextFunction } from 'express';
import { JWTUtils } from '../utils/jwt';
import { User } from '../models/user.model';
import logger from '../utils/logger';
import type { UserRole, JwtAccessPayload, AuthenticatedUser } from '@/types/auth.types';

// Extend Express Request to include user (internal app format)
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Authenticate using access token
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = JWTUtils.extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    const payload: JwtAccessPayload = JWTUtils.verifyAccessToken(token);

    // payload.sub is userId
    const user = await User.findById(payload.sub).select('isActive');

    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        message: 'User not found or inactive',
      });
      return;
    }

    // 🔥 Translate JWT payload → internal app user shape
    req.user = {
      id: payload.sub,
      role: payload.role,
    };

    next();
  } catch (error) {
    const err = error as Error;

    logger.error({ err }, 'Authentication error');

    res.status(401).json({
      success: false,
      message: err.message || 'Invalid or expired token',
    });
  }
};

/**
 * Role-based authorization
 */
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(
        {
          userId: req.user.id,
          role: req.user.role,
        },
        'Unauthorized access attempt'
      );

      res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
};

/**
 * Optional authentication
 */
export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = JWTUtils.extractTokenFromHeader(req.headers.authorization);

    if (token) {
      const payload: JwtAccessPayload = JWTUtils.verifyAccessToken(token);

      req.user = {
        id: payload.sub,
        role: payload.role,
      };
    }

    next();
  } catch {
    next();
  }
};