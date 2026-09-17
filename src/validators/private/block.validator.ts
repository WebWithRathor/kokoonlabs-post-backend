import { body, param, query } from 'express-validator';
import { validateChain } from '../../utils/helper';
import { Category } from '../../interfaces/block.interface';

export const validateCreateBlock = validateChain([
  body('type')
    .trim()
    .notEmpty()
    .withMessage('Type is required and cannot be empty'),

  body('label')
    .optional()
    .isString()
    .withMessage('Label must be a string'),

  body('fields')
    .optional()
    .isArray()
    .withMessage('Fields must be an array'),

  body('fields.*.name')
    .if(body('fields').exists())
    .trim()
    .notEmpty()
    .withMessage('Field name is required'),

  body('fields.*.kind')
    .optional()
    .isIn(['dropdown', 'number', 'text'])
    .withMessage('Field kind must be dropdown, number, or text'),

  body('fields.*.options')
    .optional()
    .isArray()
    .withMessage('Field options must be an array'),

  body('fields.*.default')
    .optional()
    .isString()
    .withMessage('Field default must be a string'),

  body('template')
    .optional()
    .isString()
    .withMessage('Template must be a string'),

  body('title')
    .optional()
    .isString()
    .withMessage('Title must be a string'),

  body('icon')
    .optional()
    .isString()
    .withMessage('Icon must be a string'),

  body('sections')
    .optional(),

  body('outputs')
    .optional()
    .isArray()
    .withMessage('Outputs must be an array'),

  body('codegen')
    .optional()
    .isString()
    .withMessage('Codegen must be a string'),

  body('declaration')
    .optional()
    .isString()
    .withMessage('Declaration must be a string'),

  body('category')
    .optional()
    .isIn(Object.values(Category))
    .withMessage('Invalid category'),
  
  body('colour')
    .optional()
    .isString()
    .withMessage('Colour must be a string'),

  body('imports')
    .optional()
    .isArray()
    .withMessage('Imports must be an array of strings'),

  body('shape')
    .optional()
    .isIn(['statement', 'value', 'hat'])
    .withMessage('Shape must be statement, value, or hat'),

  body('status')
    .optional()
    .isIn(['draft', 'published'])
    .withMessage('Status must be draft or published')
]);

export const validateUpdateBlock = validateChain([
  param('id')
    .trim()
    .notEmpty()
    .withMessage('Block ID or type is required'),

  body('type')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Type cannot be empty'),

  body('label')
    .optional()
    .isString()
    .withMessage('Label must be a string'),

  body('fields')
    .optional()
    .isArray()
    .withMessage('Fields must be an array'),

  body('fields.*.name')
    .if(body('fields').exists())
    .trim()
    .notEmpty()
    .withMessage('Field name is required'),

  body('fields.*.kind')
    .optional()
    .isIn(['dropdown', 'number', 'text'])
    .withMessage('Field kind must be dropdown, number, or text'),

  body('fields.*.options')
    .optional()
    .isArray()
    .withMessage('Field options must be an array'),

  body('fields.*.default')
    .optional()
    .isString()
    .withMessage('Field default must be a string'),

  body('template')
    .optional()
    .isString()
    .withMessage('Template must be a string'),

  body('title')
    .optional()
    .isString()
    .withMessage('Title must be a string'),

  body('icon')
    .optional()
    .isString()
    .withMessage('Icon must be a string'),

  body('sections')
    .optional(),

  body('outputs')
    .optional()
    .isArray()
    .withMessage('Outputs must be an array'),

  body('codegen')
    .optional()
    .isString()
    .withMessage('Codegen must be a string'),

  body('declaration')
    .optional()
    .isString()
    .withMessage('Declaration must be a string'),

  body('category')
    .optional()
    .isIn(Object.values(Category))
    .withMessage('Invalid category'),

  body('colour')
    .optional()
    .isString()
    .withMessage('Colour must be a string'),

  body('imports')
    .optional()
    .isArray()
    .withMessage('Imports must be an array of strings'),

  body('shape')
    .optional()
    .isIn(['statement', 'value', 'hat'])
    .withMessage('Shape must be statement, value, or hat'),

  body('status')
    .optional()
    .isIn(['draft', 'published'])
    .withMessage('Status must be draft or published')
]);

export const validateBlockIdParam = validateChain([
  param('id')
    .trim()
    .notEmpty()
    .withMessage('Block identifier is required')
]);

export const validateBlockQuery = validateChain([
  query('category')
    .optional()
    .isIn(Object.values(Category))
    .withMessage('Invalid category filter'),

  query('status')
    .optional()
    .isIn(['draft', 'published'])
    .withMessage('Invalid status filter'),

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
