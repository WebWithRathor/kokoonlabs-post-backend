import { body, param, query } from 'express-validator';
import { validateChain } from '../../utils/helper';
import { UserRole } from '../../interfaces/user.interface';

export const validateListUsers = validateChain([
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be an integer >= 1'),
  query('per_page')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('per_page must be an integer between 1 and 100'),
  query('role')
    .optional()
    .isIn(Object.values(UserRole))
    .withMessage('role must be a valid UserRole value'),
  query('status')
    .optional()
    .isIn(['active', 'blocked', 'deleted'])
    .withMessage('status must be active, blocked, or deleted'),
  query('search')
    .optional()
    .isString()
    .withMessage('search must be a string')
]);

export const validateUserId = validateChain([
  param('userId')
    .trim()
    .notEmpty()
    .withMessage('userId is required')
    .isMongoId()
    .withMessage('userId must be a valid Mongo ObjectId')
]);

export const validateUpdateUserRole = validateChain([
  param('userId')
    .trim()
    .notEmpty()
    .withMessage('userId is required')
    .isMongoId()
    .withMessage('userId must be a valid Mongo ObjectId'),
  body('role')
    .trim()
    .notEmpty()
    .withMessage('role is required')
    .isIn(Object.values(UserRole))
    .withMessage('role must be a valid UserRole value')
]);
