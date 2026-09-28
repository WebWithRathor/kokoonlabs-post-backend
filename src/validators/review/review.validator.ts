import { body, param, query } from 'express-validator';
import { validateChain } from '../../utils/helper';

export const validateReviewList = validateChain([
  query('status').optional().isIn(['pending', 'approved', 'rejected']).withMessage('Invalid status'),
  query('challengeId').optional().isMongoId().withMessage('Invalid challengeId'),
  query('courseId').optional().isMongoId().withMessage('Invalid courseId'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
]);

export const validateSubmissionId = validateChain([param('id').isMongoId().withMessage('Invalid submission id')]);

export const validateApprove = validateChain([
  param('id').isMongoId().withMessage('Invalid submission id'),
  body('score').isInt({ min: 0 }).withMessage('score must be a whole number of XP (0 or more)').toInt(),
  body('feedback').optional().isString().trim().isLength({ max: 3000 })
]);

export const validateReject = validateChain([
  param('id').isMongoId().withMessage('Invalid submission id'),
  body('feedback')
    .isString()
    .trim()
    .isLength({ min: 10, max: 3000 })
    .withMessage('Tell the student what to fix (at least 10 characters)')
]);
