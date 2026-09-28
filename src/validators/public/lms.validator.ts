import { body, param } from 'express-validator';
import { validateChain } from '../../utils/helper';

const courseId = param('courseId').isMongoId().withMessage('Invalid course id');

export const validateCourseParam = validateChain([courseId]);

export const validateSubModuleParam = validateChain([
  courseId,
  param('subModuleId').isMongoId().withMessage('Invalid sub-module id')
]);

export const validateContentParam = validateChain([
  courseId,
  param('linkId').isMongoId().withMessage('Invalid content id')
]);

export const validateHeartbeat = validateChain([
  courseId,
  param('linkId').isMongoId().withMessage('Invalid content id'),
  body('start').isFloat({ min: 0 }).withMessage('start must be a number of seconds >= 0').toFloat(),
  body('end').isFloat({ min: 0 }).withMessage('end must be a number of seconds >= 0').toFloat(),
  body('position').isFloat({ min: 0 }).withMessage('position must be a number of seconds >= 0').toFloat(),
  // A heartbeat covers a short stretch (~15 s); longer claims are refused
  body('end').custom((end: number, { req }) => {
    const start = Number(req.body.start);
    if (end <= start) throw new Error('end must be after start');
    if (end - start > 60) throw new Error('A heartbeat can cover at most 60 seconds');
    return true;
  })
]);

export const validateMcqAttempt = validateChain([
  courseId,
  param('linkId').isMongoId().withMessage('Invalid content id'),
  body('selected').isArray({ min: 1, max: 20 }).withMessage('selected must be a non-empty array of option indexes'),
  body('selected.*').isInt({ min: 0, max: 50 }).withMessage('Each selected option must be an index').toInt()
]);
