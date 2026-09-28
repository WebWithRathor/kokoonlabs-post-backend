import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import ErrorHandler from '../../utils/error-handler';
import { ERROR_CODES } from '../../constants/error-codes';
import * as Extra from '../../services/private/lms-admin-extra.service';

const admin = (req: Request) => {
  if (!req.user?._id) throw new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN);
  const name = [req.user.name?.firstName, req.user.name?.lastName].filter(Boolean).join(' ') || 'Admin';
  return { id: String(req.user._id), name };
};
const pageOf = (req: Request) => req.pagination || { page: 1, limit: 20, skip: 0 };

export const createChallenge = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.created(await Extra.createChallenge(req.body, admin(req).id), 'Challenge created successfully').send(res);
});

export const updateChallenge = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Extra.updateChallenge(String(req.params.id), req.body), 'Challenge updated successfully').send(res);
});

export const listChallenges = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const isActive = req.query.isActive === undefined ? undefined : String(req.query.isActive) === 'true';
  const result = await Extra.listChallenges(
    { type: req.query.type as string | undefined, courseId: req.query.courseId as string | undefined, isActive },
    pageOf(req)
  );
  ResponseHandler.success(result, 'Challenges fetched successfully').send(res);
});

export const createAnnouncement = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.created(await Extra.createAnnouncement(req.body, admin(req)), 'Announcement published').send(res);
});

export const updateAnnouncement = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Extra.updateAnnouncement(String(req.params.id), req.body), 'Announcement updated').send(res);
});

export const listAnnouncements = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Extra.listAnnouncements(pageOf(req)), 'Announcements fetched successfully').send(res);
});
