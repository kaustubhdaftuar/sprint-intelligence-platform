import { Request, Response, NextFunction } from 'express';
import { JWTUtils, JWTPayload } from '../utils/jwt';
import { User, UserRole } from '../models/User';
import logger from '../config/logger';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * Middleware to authenticate requests using JWT
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from header
    const token = JWTUtils.extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    // Verify token
    const payload = JWTUtils.verifyToken(token);

    // Optional: Verify user still exists and is active
    const user = await User.findById(payload.userId).select('isActive');
    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        message: 'User not found or inactive',
      });
      return;
    }

    // Attach user payload to request
    req.user = payload;
    next();
  } catch (error: any) {
    logger.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      message: error.message || 'Invalid or expired token',
    });
  }
};

/**
 * Middleware to authorize based on user roles
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
        `Unauthorized access attempt by user ${req.user.userId} with role ${req.user.role}`
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
 * Optional authentication - doesn't fail if no token provided
 */
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = JWTUtils.extractTokenFromHeader(req.headers.authorization);

    if (token) {
      const payload = JWTUtils.verifyToken(token);
      req.user = payload;
    }

    next();
  } catch (error) {
    // Silently continue without authentication
    next();
  }
};