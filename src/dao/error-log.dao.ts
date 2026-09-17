import mongoose from 'mongoose';
import ErrorLog from '../models/error-log.model';
import { IErrorLog, IErrorLogDao } from '../interfaces/error-log.interface';

export class ErrorLogDao implements IErrorLogDao {
  /**
   * Create a new error log
   */
  async create(data: Partial<IErrorLog>): Promise<IErrorLog> {
    return await ErrorLog.create(data);
  }

  /**
   * Find error log by ID
   */
  async findById(id: string): Promise<IErrorLog | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    return await ErrorLog.findById(id);
  }

  /**
   * Find all error logs with pagination and filtering
   */
  async findAll(
    filter: Record<string, string | number | boolean | object> | object = {},
    sort: Record<string, 1 | -1> = { createdAt: -1 },
    skip: number = 0,
    limit: number = 50
  ): Promise<IErrorLog[]> {
    return await ErrorLog.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('user', 'name email');
  }

  /**
   * Find one error log by filter
   */
  async findOne(
    filter: Record<string, string | number | boolean | object> | object
  ): Promise<IErrorLog | null> {
    return await ErrorLog.findOne(filter);
  }

  /**
   * Update an error log
   */
  async update(
    id: string,
    data: Partial<IErrorLog>
  ): Promise<IErrorLog | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    return await ErrorLog.findByIdAndUpdate(id, { $set: data }, { new: true });
  }

  /**
   * Delete an error log
   */
  async delete(id: string): Promise<IErrorLog | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return null;
    }
    return await ErrorLog.findByIdAndDelete(id);
  }

  /**
   * Count error logs by filter
   */
  async count(
    filter: Record<string, string | number | boolean | object> | object = {}
  ): Promise<number> {
    return await ErrorLog.countDocuments(filter);
  }

  /**
   * Delete multiple error logs
   */
  async deleteMany(
    filter: Record<string, string | number | boolean | object> | object
  ): Promise<number> {
    const result = await ErrorLog.deleteMany(filter);
    return result.deletedCount || 0;
  }
}

export default new ErrorLogDao();
