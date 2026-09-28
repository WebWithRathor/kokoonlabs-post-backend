import { body, query } from 'express-validator';
import { validateChain } from '../../utils/helper';

export const validateNotificationList = validateChain([
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be an integer >= 1').toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50').toInt()
]);

// Either { all: true } or { ids: [...] }
export const validateMarkRead = validateChain([
  body('all').optional().isBoolean().withMessage('all must be true or false').toBoolean(),
  body('ids')
    .if(body('all').not().equals('true'))
    .optional()
    .isArray({ min: 1, max: 100 })
    .withMessage('ids must be an array of notification ids'),
  body('ids.*').optional().isMongoId().withMessage('Invalid notification id'),
  body().custom(b => {
    if (!b?.all && !(Array.isArray(b?.ids) && b.ids.length)) throw new Error('Send ids or all: true');
    return true;
  })
]);
