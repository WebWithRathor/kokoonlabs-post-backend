import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import ErrorHandler from '../../utils/error-handler';
import { ERROR_CODES } from '../../constants/error-codes';
import {
  getHome,
  getProfile,
  listNotifications,
  markNotificationsRead
} from '../../services/public/lms/dashboard.service';

const userIdOf = (req: Request): string => {
  if (!req.user?._id) throw new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN);
  return String(req.user._id);
};

export const getHomeController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await getHome(userIdOf(req)), 'Home fetched successfully').send(res);
});

export const getProfileController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await getProfile(userIdOf(req)), 'Profile fetched successfully').send(res);
});

export const listNotificationsController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const page = req.pagination || { page: 1, limit: 20, skip: 0 };
  ResponseHandler.success(await listNotifications(userIdOf(req), page), 'Notifications fetched successfully').send(res);
});

export const markNotificationsReadController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const body = req.body as { ids?: string[]; all?: boolean };
  const result = await markNotificationsRead(userIdOf(req), body.all ? 'all' : body.ids ?? []);
  ResponseHandler.success(result, 'Notifications marked as read').send(res);
});
