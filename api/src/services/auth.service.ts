import { UserRepository } from '../repositories/user.repository';
import { UserRole } from '../models/User';
import { JWTUtils, TokenPair } from '../utils/jwt';
import { AppError } from '../middleware/errorHandler';
import logger from '../config/logger';

export class AuthService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  /**
   * Register a new user
   */
  async register(userData: {
    email: string;
    password: string;
    name: string;
    role?: UserRole;
  }): Promise<{ user: any; tokens: TokenPair }> {
    // Check if email already exists
    const existingUser = await this.userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new AppError('Email already registered', 409);
    }

    // Create user
    const user = await this.userRepository.create(userData);

    // Generate tokens
    const tokens = JWTUtils.generateTokenPair({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    logger.info(`New user registered: ${user.email}`);

    return {
      user: user.toJSON(),
      tokens,
    };
  }

  /**
   * Login user
   */
  async login(
    email: string,
    password: string
  ): Promise<{ user: any; tokens: TokenPair }> {
    // Find user with password field
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    // Check if user is active
    if (!user.isActive) {
      throw new AppError('Account is deactivated', 403);
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password', 401);
    }

    // Generate tokens
    const tokens = JWTUtils.generateTokenPair({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    logger.info(`User logged in: ${user.email}`);

    return {
      user: user.toJSON(),
      tokens,
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      // Verify refresh token
      const payload = JWTUtils.verifyToken(refreshToken);

      // Verify user still exists
      const user = await this.userRepository.findById(payload.userId);
      if (!user || !user.isActive) {
        throw new AppError('User not found or inactive', 401);
      }

      // Generate new token pair
      const tokens = JWTUtils.generateTokenPair({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      return tokens;
    } catch (error: any) {
      throw new AppError(error.message || 'Invalid refresh token', 401);
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user.toJSON();
  }

  /**
   * Update user profile
   */
  async updateProfile(
    userId: string,
    updates: { name?: string; email?: string }
  ) {
    // If email is being updated, check if it's already taken
    if (updates.email) {
      const existingUser = await this.userRepository.findByEmail(updates.email);
      if (existingUser && existingUser._id.toString() !== userId) {
        throw new AppError('Email already in use', 409);
      }
    }

    const user = await this.userRepository.update(userId, updates);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user.toJSON();
  }

  /**
   * Change password
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.userRepository.findByEmail(
      (await this.userRepository.findById(userId))?.email || ''
    );

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Verify current password
    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      throw new AppError('Current password is incorrect', 401);
    }

    // Update password
    user.password = newPassword;
    await user.save();

    logger.info(`Password changed for user: ${user.email}`);
  }
}