import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import ErrorHandler from '../../utils/error-handler';
import { ERROR_CODES } from '../../constants/error-codes';
import { getCourseOutline } from '../../services/public/lms/outline.service';
import {
  LearnerContext,
  getPlayback,
  getSubModule,
  markNoteDone,
  openContent,
  startCourse,
  submitMcqAttempt,
  videoHeartbeat
} from '../../services/public/lms/progress.service';

// Learner = logged-in user + the enrollment checked by requireEnrollment
const learner = (req: Request): LearnerContext => {
  const user = req.user;
  const enrollment = req.lmsEnrollment;
  if (!user?._id || !enrollment) throw new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN);
  const name = [user.name?.firstName, user.name?.lastName].filter(Boolean).join(' ') || 'Student';
  return {
    userId: String(user._id),
    userName: name,
    courseId: String(req.params.courseId),
    courseName: enrollment.courseTitle || 'Course',
    batchId: enrollment.batchId ? String(enrollment.batchId) : undefined
  };
};

export const startCourseController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await startCourse(learner(req));
  ResponseHandler.success(result, result.started ? 'Course started' : 'Course already started').send(res);
});

export const getOutlineController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const ctx = learner(req);
  let outline = await getCourseOutline(ctx.userId, ctx.courseId);
  if (!outline) {
    // First visit: start the course, then build the outline
    await startCourse(ctx);
    outline = await getCourseOutline(ctx.userId, ctx.courseId);
  }
  ResponseHandler.success(outline, 'Course outline fetched successfully').send(res);
});

export const getSubModuleController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await getSubModule(learner(req), String(req.params.subModuleId));
  ResponseHandler.success(result, 'Sub-module fetched successfully').send(res);
});

export const openContentController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await openContent(learner(req), String(req.params.linkId));
  ResponseHandler.success(result, 'Content fetched successfully').send(res);
});

export const getPlaybackController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await getPlayback(learner(req), String(req.params.linkId));
  res.setHeader('Cache-Control', 'private, no-store');
  ResponseHandler.success(result, 'Playback ready').send(res);
});

export const videoHeartbeatController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { start, end, position } = req.body as { start: number; end: number; position: number };
  const result = await videoHeartbeat(learner(req), String(req.params.linkId), { start, end, position });
  ResponseHandler.success(result, 'Progress saved').send(res);
});

export const markNoteDoneController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await markNoteDone(learner(req), String(req.params.linkId));
  ResponseHandler.success(result, 'Note marked as done').send(res);
});

export const submitMcqAttemptController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const selected = (req.body.selected as number[]).map(Number);
  const result = await submitMcqAttempt(learner(req), String(req.params.linkId), selected);
  ResponseHandler.success(result, result.message).send(res);
});
