import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import {
  createProjectService,
  listProjectsService,
  getProjectByIdService,
  updateProjectService,
  deleteProjectService
} from '../../services/public/project.service';

const getUserId = (req: Request): string => {
  return String(req.user?._id || req.headers['x-user-id'] || req.body?.userId || '');
};

export const createProject = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const result = await createProjectService(userId, req.body);
    ResponseHandler.created(result, 'Project created successfully').send(res);
  }
);

export const listProjects = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const search = req.query.search ? String(req.query.search) : undefined;

    const result = await listProjectsService(userId, { page, limit, search });
    ResponseHandler.success(result, 'Projects fetched successfully').send(res);
  }
);

export const getProject = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const id = req.params.id as string;
    const result = await getProjectByIdService(userId, id);
    ResponseHandler.success(result, 'Project fetched successfully').send(res);
  }
);

export const updateProject = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const id = req.params.id as string;
    const result = await updateProjectService(userId, id, req.body);
    ResponseHandler.success(result, 'Project updated successfully').send(res);
  }
);

export const deleteProject = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const id = req.params.id as string;
    const result = await deleteProjectService(userId, id);
    ResponseHandler.success(result, 'Project deleted successfully').send(res);
  }
);
