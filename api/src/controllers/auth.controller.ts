import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { asyncHandler } from '../middleware/errorHandler';
import Joi from 'joi';
import { UserRole } from '../models/User';

export class AuthController {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * Register new user
   * POST /api/auth/register
   */
  register = asyncHandler(async (req: Request, res: Response) => {
    // Validation schema
    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(8).required(),
      name: Joi.string().min(2).required(),
      role: Joi.string().valid(...Object.values(UserRole)).optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
      return;
    }

    const result = await this.authService.register(value);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: result,
    });
  });

  /**
   * Login user
   * POST /api/auth/login
   */
  login = asyncHandler(async (req: Request, res: Response) => {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
      return;
    }

    const result = await this.authService.login(value.email, value.password);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result,
    });
  });

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  refreshToken = asyncHandler(async (req: Request, res: Response) => {
    const schema = Joi.object({
      refreshToken: Joi.string().required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
      return;
    }

    const tokens = await this.authService.refreshToken(value.refreshToken);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: { tokens },
    });
  });

  /**
   * Get current user profile
   * GET /api/auth/me
   */
  getProfile = asyncHandler(async (req: Request, res: Response) => {
    const user = await this.authService.getProfile(req.user!.userId);

    res.status(200).json({
      success: true,
      data: { user },
    });
  });

  /**
   * Update user profile
   * PUT /api/auth/profile
   */
  updateProfile = asyncHandler(async (req: Request, res: Response) => {
    const schema = Joi.object({
      name: Joi.string().min(2).optional(),
      email: Joi.string().email().optional(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
      return;
    }

    const user = await this.authService.updateProfile(req.user!.userId, value);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user },
    });
  });

  /**
   * Change password
   * POST /api/auth/change-password
   */
  changePassword = asyncHandler(async (req: Request, res: Response) => {
    const schema = Joi.object({
      currentPassword: Joi.string().required(),
      newPassword: Joi.string().min(8).required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
      return;
    }

    await this.authService.changePassword(
      req.user!.userId,
      value.currentPassword,
      value.newPassword
    );

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  });
}