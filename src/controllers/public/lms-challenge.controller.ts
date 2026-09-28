import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import ErrorHandler from '../../utils/error-handler';
import { ERROR_CODES } from '../../constants/error-codes';
import { getChallenge, getMySubmission, submitProject } from '../../services/public/lms/challenge.service';

const userIdOf = (req: Request): string => {
  if (!req.user?._id) throw new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN);
  return String(req.user._id);
};

export const getChallengeController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await getChallenge(userIdOf(req), String(req.params.challengeId));
  ResponseHandler.success(result, 'Challenge fetched successfully').send(res);
});

export const submitProjectController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { projectId, videoUrl } = req.body as { projectId: string; videoUrl: string };
  const result = await submitProject(userIdOf(req), String(req.params.challengeId), { projectId, videoUrl });
  ResponseHandler.created(result, result.message).send(res);
});

export const getMySubmissionController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await getMySubmission(userIdOf(req), String(req.params.id));
  ResponseHandler.success(result, 'Submission fetched successfully').send(res);
});
