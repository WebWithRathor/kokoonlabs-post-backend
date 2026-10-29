import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import ErrorHandler from '../../utils/error-handler';
import { ERROR_CODES } from '../../constants/error-codes';
import {
  copyControlPageService,
  createControlPageService,
  deleteControlPageService,
  listControlPagesService,
  updateControlPageService
} from '../../services/public/control-page.service';

// Only the logged-in user from the session, never an id from the request
const getUserId = (req: Request): string => {
  if (!req.user?._id) throw new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN);
  return String(req.user._id);
};

export const listControlPages = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await listControlPagesService(getUserId(req), req.query.kind ? String(req.query.kind) : undefined);
  ResponseHandler.success(result, 'Pages fetched').send(res);
});

export const createControlPage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await createControlPageService(getUserId(req), req.body ?? {});
  ResponseHandler.created(result, 'Page saved').send(res);
});

export const updateControlPage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await updateControlPageService(getUserId(req), req.params.id as string, req.body ?? {});
  ResponseHandler.success(result, 'Page saved').send(res);
});

export const copyControlPage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await copyControlPageService(getUserId(req), req.params.id as string);
  ResponseHandler.created(result, 'Page copied').send(res);
});

export const deleteControlPage = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await deleteControlPageService(getUserId(req), req.params.id as string);
  ResponseHandler.success(result, 'Page deleted').send(res);
});
