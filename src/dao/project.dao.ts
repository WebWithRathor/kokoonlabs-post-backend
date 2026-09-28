import mongoose from 'mongoose';
import ProjectModel from '../models/project.model';
import { IProject, pagination } from '../interfaces';
import { searchRegex } from '../utils/regex';

export class ProjectDao {
  async create(data: Partial<IProject>): Promise<IProject> {
    return await ProjectModel.create(data);
  }

  async findById(id: string): Promise<IProject | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return await ProjectModel.findById(id).exec();
  }

  async findByUserAndId(userId: string, id: string): Promise<IProject | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return await ProjectModel.findOne({ _id: id, userId }).exec();
  }

  async list(
    filter: Record<string, any> = {},
    options: {
      page?: number;
      limit?: number;
      skip?: number;
      sort?: Record<string, 1 | -1>;
    } = {}
  ): Promise<{
    projects: IProject[];
    pagination: pagination;
  }> {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = options.skip !== undefined ? options.skip : (page - 1) * limit;
    const sort = options.sort || { updatedAt: -1 };

    const queryFilter: Record<string, any> = { ...filter };

    if (queryFilter.search) {
      const regex = searchRegex(queryFilter.search);
      queryFilter.$or = [
        { title: regex },
        { description: regex }
      ];
      delete queryFilter.search;
    }

    const [projects, total] = await Promise.all([
      ProjectModel.find(queryFilter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      ProjectModel.countDocuments(queryFilter).exec()
    ]);

    return {
      projects,
      pagination: {
        currentPage: page,
        total,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async update(
    id: string,
    data: Partial<IProject>
  ): Promise<IProject | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return await ProjectModel.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true
    }).exec();
  }

  // Owner-scoped update: matches only if this user owns the project
  async updateForUser(
    userId: string,
    id: string,
    data: Partial<IProject>
  ): Promise<IProject | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return await ProjectModel.findOneAndUpdate({ _id: id, userId }, data, {
      new: true,
      runValidators: true
    }).exec();
  }

  // Owner-scoped delete: matches only if this user owns the project
  async deleteForUser(userId: string, id: string): Promise<IProject | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return await ProjectModel.findOneAndDelete({ _id: id, userId }).exec();
  }

  async delete(id: string): Promise<IProject | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return await ProjectModel.findByIdAndDelete(id).exec();
  }
}

export default new ProjectDao();
