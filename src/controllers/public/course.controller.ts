import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import {
  listActiveCoursesService,
  getCourseBySlugOrIdService
} from '../../services/public/course.service';

export const listActiveCourses = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const pagination = req.pagination || { page: 1, limit: 20, skip: 0 };
    const { filter = {}, sort } = req.dbQuery || {};

    const result = await listActiveCoursesService({
      pagination,
      filter,
      sort
    });

    ResponseHandler.success(result, 'Active courses fetched successfully').send(res);
  }
);

export const getCourseBySlugOrId = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const slugOrId = req.params.slugOrId as string;
    const course = await getCourseBySlugOrIdService(slugOrId);
    ResponseHandler.success(course, 'Course fetched successfully').send(res);
  }
);
