import User from '../models/user.model';
import { IUser } from '../interfaces/user.interface';
import mongoose from 'mongoose';

export class UserDao {
  /**
   * Save or update a user instance
   */
  async save(user: IUser): Promise<IUser> {
    if (typeof (user as any).save === 'function') {
      return await (user as any).save();
    }
    return (await User.findByIdAndUpdate(
      user._id,
      { $set: user },
      { new: true }
    )) as unknown as IUser;
  }

  /**
   * Find user by ID including refreshToken field
   */
  async findByIdWithRefreshToken(id: string): Promise<IUser | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    return (await User.findById(id).select(
      '+refreshToken'
    )) as unknown as IUser | null;
  }

  /**
   * Find user by filter including password field
   */
  async findOneWithPassword(
    filter: Record<string, any>
  ): Promise<IUser | null> {
    return (await User.findOne(filter).select(
      '+password'
    )) as unknown as IUser | null;
  }

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<IUser | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    return (await User.findById(id)) as unknown as IUser | null;
  }

  /**
   * Find user by filter
   */
  async findOne(filter: Record<string, any>): Promise<IUser | null> {
    return (await User.findOne(filter)) as unknown as IUser | null;
  }

  /**
   * Create new user
   */
  async create(userData: Partial<IUser>): Promise<IUser> {
    return (await User.create(userData)) as IUser;
  }

  /**
   * Unset specific fields on a user document
   */
  async unsetFields(id: string, fields: Record<string, 1>): Promise<IUser | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    return (await User.findByIdAndUpdate(
      id,
      { $unset: fields },
      { new: true }
    )) as unknown as IUser | null;
  }
}

export const userDao = new UserDao();
export default userDao;
