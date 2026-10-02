import { body, param, query } from 'express-validator';
import { validateChain } from '../../utils/helper';

const idParam = param('id').isMongoId().withMessage('Invalid function block id');

export const validateList = validateChain([
  query('status').optional().isIn(['private', 'pending', 'published', 'rejected']),
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
]);
export const validateId = validateChain([idParam]);
export const validateApprove = validateChain([idParam, body('note').optional().isString().trim().isLength({ max: 1000 })]);
export const validateReject = validateChain([
  idParam,
  body('note').isString().trim().isLength({ min: 10, max: 1000 }).withMessage('Tell the student what to change (at least 10 characters)')
]);
