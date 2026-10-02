import { body, param, query } from 'express-validator';
import { validateChain } from '../../utils/helper';

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const idParam = param('id').isMongoId().withMessage('Invalid function block id');

const fields = (creating: boolean) => [
  (creating ? body('name') : body('name').optional())
    .isString()
    .trim()
    .matches(IDENTIFIER)
    .isLength({ max: 60 })
    .withMessage('Function name: letters, numbers and _ only, not starting with a number'),
  (creating ? body('title') : body('title').optional()).isString().trim().notEmpty().isLength({ max: 80 }).withMessage('Title is required (80 characters max)'),
  body('description').optional().isString().trim().isLength({ max: 300 }).withMessage('Description: 300 characters max'),
  body('params').optional().isArray({ max: 10 }).withMessage('At most 10 inputs'),
  body('params.*').optional().isString().matches(IDENTIFIER).withMessage('Input names: letters, numbers and _ only'),
  body('isAsync').optional().isBoolean().toBoolean(),
  body('returnValue').optional().isString().trim().isLength({ max: 200 }),
  (creating ? body('graph') : body('graph').optional()).isObject().withMessage('graph is required'),
  body('code').optional().isString().isLength({ max: 50000 })
];

export const validateCreate = validateChain([...fields(true), body('forkedFromId').optional().isMongoId()]);
export const validateUpdate = validateChain([idParam, ...fields(false)]);
export const validateId = validateChain([idParam]);
export const validateCommunityQuery = validateChain([
  query('search').optional().isString().trim().isLength({ max: 100 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
]);
