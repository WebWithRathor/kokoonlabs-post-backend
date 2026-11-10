import { body } from 'express-validator';
import { validateChain } from '../../utils/helper';

export const validateBuild = validateChain([
  body('message')
    .isString()
    .withMessage('Write what you want to build')
    .bail()
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Your message must be 1 to 1000 characters'),
  body('conversationId').optional({ values: 'null' }).isUUID().withMessage('Invalid conversation'),
  body('canvas').optional({ values: 'null' }).isObject().withMessage('Invalid canvas'),
  body('canvas.blocks').optional().isArray({ max: 200 }).withMessage('Invalid canvas blocks'),
  body('canvas.events').optional().isArray({ max: 50 }).withMessage('Invalid canvas events')
]);
