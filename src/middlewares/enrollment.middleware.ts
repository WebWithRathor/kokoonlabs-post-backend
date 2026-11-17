import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import asyncHandler from '../utils/async-handler';
import ErrorHandler from '../utils/error-handler';
import { ERROR_CODES } from '../constants/error-codes';
import LmsEnrollmentDao from '../dao/lms-enrollment.dao';

// The student must have a successful enrollment in :courseId
export const requireEnrollment = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user?._id) throw new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN);
  const courseId = String(req.params.courseId);
  if (!mongoose.Types.ObjectId.isValid(courseId)) throw new ErrorHandler(ERROR_CODES.COURSE_NOT_FOUND);

  const enrollment = await LmsEnrollmentDao.findActive(String(req.user._id), courseId);
  if (!enrollment) {
    const ended = await LmsEnrollmentDao.findEnded(String(req.user._id), courseId);
    if (ended) {
      const on = ended.expiresAt
        ? ` on ${new Date(ended.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}`
        : '';
      throw new ErrorHandler({
        statusCode: 403,
        message: `Your access to this course ended${on}. Activate a new kit to continue where you left off.`,
        errorCode: 'ACCESS_EXPIRED'
      });
    }
    throw new ErrorHandler({ statusCode: 403, message: 'You are not enrolled in this course.', errorCode: 'NOT_ENROLLED' });
  }
  req.lmsEnrollment = enrollment;
  next();
});
