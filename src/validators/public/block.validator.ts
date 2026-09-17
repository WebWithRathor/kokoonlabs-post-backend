import { param, query } from 'express-validator';
import { validateChain } from '../../utils/helper';
import { Category } from '../../interfaces/block.interface';

export const validatePublicBlockQuery = validateChain([
  query('category')
    .optional()
    .isIn(Object.values(Category))
    .withMessage('Invalid category filter'),

  query('shape')
    .optional()
    .isIn(['statement', 'value', 'hat'])
    .withMessage('Invalid shape filter'),

  query('search')
    .optional()
    .isString()
    .withMessage('Search query must be a string'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be an integer >= 1')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be an integer between 1 and 100')
    .toInt(),

  query('sort')
    .optional()
    .isString()
    .trim()
    .withMessage('Sort must be a string')
]);

export const validateBlockParam = validateChain([
  param('idOrType')
    .trim()
    .notEmpty()
    .withMessage('Block id or type parameter is required')
]);
