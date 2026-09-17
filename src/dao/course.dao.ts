import mongoose from 'mongoose';
import courseModel from '../models/course.model';
import { ICourse, CourseStateEnum, pagination } from '../interfaces';

export class CourseDao {
  async listActiveCourses(
    filter: Record<string, any> = {},
    options: {
      page?: number;
      perPage?: number;
      sort?: Record<string, 1 | -1>;
    } = {}
  ): Promise<{
    courses: ICourse[];
    pagination: pagination;
  }> {
    const page = options.page || 1;
    const limit = options.perPage || 20;
    const skip = (page - 1) * limit;
    const sort = options.sort || { order: 1, createdAt: -1 };

    const queryFilter: Record<string, any> = {
      ...filter,
      state: CourseStateEnum.PUBLISHED
    };

    const [courses, total] = await Promise.all([
      courseModel
        .find(queryFilter)
        .select([
          'title',
          'metaData.description',
          'metaData.language',
          'metaData.thumbnail',
          'metaData.displayVideo',
          'metaData.displayTags',
          'price',
          'discountPercentage',
          'state',
          'type'
        ])
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      courseModel.countDocuments(queryFilter).exec()
    ]);

    return {
      courses,
      pagination: {
        currentPage: page,
        total,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async findBySlugOrId(slugOrId: string): Promise<ICourse | null> {
    const isObjectId = mongoose.Types.ObjectId.isValid(slugOrId);

    if (isObjectId) {
      const course = await courseModel
        .findOne({
          $or: [{ _id: slugOrId }, { slug: slugOrId }],
          state: CourseStateEnum.PUBLISHED
        })
        .exec();
      if (course) return course;
    }

    // Search by slug or title match
    const titleRegex = new RegExp(`^${slugOrId.replace(/-/g, ' ')}$`, 'i');
    return await courseModel
      .findOne({
        $or: [{ slug: slugOrId }, { title: titleRegex }],
        state: CourseStateEnum.PUBLISHED
      })
      .exec();
  }

  async findById(id: string): Promise<ICourse | null> {
    return await courseModel.findById(id).exec();
  }

  async create(data: Partial<ICourse>): Promise<ICourse> {
    return await courseModel.create(data);
  }

  async update(id: string, data: Partial<ICourse>): Promise<ICourse | null> {
    return await courseModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }
}

export default new CourseDao();
