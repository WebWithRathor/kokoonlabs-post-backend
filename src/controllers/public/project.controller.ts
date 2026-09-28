import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import ErrorHandler from '../../utils/error-handler';
import { ERROR_CODES } from '../../constants/error-codes';
import {
  createProjectService,
  listProjectsService,
  getProjectByIdService,
  updateProjectService,
  deleteProjectService
} from '../../services/public/project.service';

// Only the logged-in user from the session. Never trust an id sent by the
// client (header or body) — that let anyone act as any student.
const getUserId = (req: Request): string => {
  if (!req.user?._id) {
    throw new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN);
  }
  return String(req.user._id);
};

const toPositiveInt = (value: unknown, fallback: number, max?: number): number => {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return max ? Math.min(n, max) : n;
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
    const page = toPositiveInt(req.query.page, 1);
    const limit = toPositiveInt(req.query.limit, 50, 100);
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
