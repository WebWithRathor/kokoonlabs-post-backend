import { body, param, query } from 'express-validator';
import { validateChain } from '../../utils/helper';

const idParam = param('id').isMongoId().withMessage('Invalid id');

const challengeRules = (creating: boolean) => [
  (creating ? body('type') : body('type').optional()).isIn(['global', 'course']).withMessage('type must be global or course'),
  (creating ? body('title') : body('title').optional()).isString().trim().notEmpty().isLength({ max: 200 }),
  (creating ? body('description') : body('description').optional()).isString().trim().notEmpty(),
  body('instructions').optional().isString(),
  (creating ? body('maxXp') : body('maxXp').optional()).isInt({ min: 0, max: 1000 }).withMessage('maxXp must be 0-1000').toInt(),
  body('maxResubmissions').optional().isInt({ min: 0, max: 10 }).toInt(),
  body('skill').optional({ values: 'null' }).isMongoId(),
  body('requiredLevel').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
  body('course').optional({ values: 'null' }).isMongoId(),
  body('unlockAfterSubModule').optional({ values: 'null' }).isMongoId(),
  body('isActive').optional().isBoolean().toBoolean()
];

export const validateCreateChallenge = validateChain(challengeRules(true));
export const validateUpdateChallenge = validateChain([idParam, ...challengeRules(false)]);

export const validateListQuery = validateChain([
  query('type').optional().isIn(['global', 'course']),
  query('courseId').optional().isMongoId(),
  query('isActive').optional().isIn(['true', 'false']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
]);

const announcementRules = (creating: boolean) => [
  (creating ? body('title') : body('title').optional()).isString().trim().notEmpty().isLength({ max: 200 }),
  (creating ? body('content') : body('content').optional()).isString().trim().notEmpty().isLength({ max: 5000 }),
  body('course').optional({ values: 'null' }).isMongoId().withMessage('Invalid course'),
  body('batch').optional({ values: 'null' }).isMongoId().withMessage('Invalid batch'),
  body('priority').optional().isIn(['low', 'medium', 'high']),
  body('attachments').optional().isArray({ max: 10 }),
  body('attachments.*.url').optional().isURL({ require_protocol: true }),
  body('isActive').optional().isBoolean().toBoolean(),
  body('expiresAt').optional({ values: 'null' }).isISO8601().toDate()
];

export const validateCreateAnnouncement = validateChain(announcementRules(true));
export const validateUpdateAnnouncement = validateChain([idParam, ...announcementRules(false)]);
