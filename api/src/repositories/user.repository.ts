import { User, IUser, UserRole } from '../models/user.model';
import { Types } from 'mongoose';

export class UserRepository {
  /**
   * Create a new user
   */
  async create(userData: {
    email: string;
    password: string;
    name: string;
    role?: UserRole;
  }): Promise<IUser> {
    const user = new User(userData);
    return await user.save();
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<IUser | null> {
    return await User.findOne({ email }).select('+password');
  }

  /**
   * Find user by ID
   */
  async findById(id: string | Types.ObjectId): Promise<IUser | null> {
    return await User.findById(id);
  }

  /**
   * Find all users with optional filters
   */
  async findAll(filters: {
    role?: UserRole;
    isActive?: boolean;
  } = {}): Promise<IUser[]> {
    return await User.find(filters);
  }

  /**
   * Update user
   */
  async update(
    id: string | Types.ObjectId,
    updates: Partial<IUser>
  ): Promise<IUser | null> {
    return await User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
  }

  /**
   * Delete user (soft delete by setting isActive to false)
   */
  async delete(id: string | Types.ObjectId): Promise<IUser | null> {
    return await User.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string): Promise<boolean> {
    const count = await User.countDocuments({ email });
    return count > 0;
  }

  /**
   * Get user statistics
   */
  async getStats(): Promise<{
    total: number;
    byRole: Record<UserRole, number>;
    active: number;
  }> {
    const [stats] = await User.aggregate([
      {
        $facet: {
          total: [{ $count: 'count' }],
          byRole: [
            { $group: { _id: '$role', count: { $sum: 1 } } },
          ],
          active: [
            { $match: { isActive: true } },
            { $count: 'count' },
          ],
        },
      },
    ]);

    return {
      total: stats.total[0]?.count || 0,
      byRole: stats.byRole.reduce(
        (acc: Record<UserRole, number>, item: any) => {
          acc[item._id as UserRole] = item.count;
          return acc;
        },
        {} as Record<UserRole, number>
      ),
      active: stats.active[0]?.count || 0,
    };
  }
}