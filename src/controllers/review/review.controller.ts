import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import ErrorHandler from '../../utils/error-handler';
import { ERROR_CODES } from '../../constants/error-codes';
import { SubmissionStatus } from '../../interfaces/lms-rewards.interface';
import {
  approveSubmission,
  getSubmission,
  listSubmissions,
  rejectSubmission
} from '../../services/review/review.service';

const reviewerId = (req: Request): string => {
  if (!req.user?._id) throw new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN);
  return String(req.user._id);
};

export const listSubmissionsController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const page = req.pagination || { page: 1, limit: 20, skip: 0 };
  const status = (req.query.status as SubmissionStatus) || 'pending';
  const result = await listSubmissions(
    status,
    { challengeId: req.query.challengeId as string | undefined, courseId: req.query.courseId as string | undefined },
    page
  );
  ResponseHandler.success(result, 'Submissions fetched successfully').send(res);
});

export const getSubmissionController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await getSubmission(String(req.params.id)), 'Submission fetched successfully').send(res);
});

export const approveSubmissionController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { score, feedback } = req.body as { score: number; feedback?: string };
  const result = await approveSubmission(String(req.params.id), reviewerId(req), Number(score), feedback);
  ResponseHandler.success(result, 'Project approved').send(res);
});

export const rejectSubmissionController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { feedback } = req.body as { feedback: string };
  const result = await rejectSubmission(String(req.params.id), reviewerId(req), feedback);
  ResponseHandler.success(result, 'Sent back with feedback').send(res);
});
