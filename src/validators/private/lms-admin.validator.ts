import { body, param } from 'express-validator';
import { validateChain } from '../../utils/helper';

const mongoParam = (name: string) => param(name).isMongoId().withMessage(`Invalid ${name}`);
const optText = (field: string, max = 5000) =>
  body(field).optional().isString().trim().isLength({ max }).withMessage(`${field} must be text up to ${max} characters`);
const skillsRules = [
  body('skills').optional().isArray({ max: 20 }).withMessage('skills must be an array'),
  body('skills.*.skill').optional().isMongoId().withMessage('Invalid skill id'),
  body('skills.*.level').optional().isInt({ min: 1, max: 50 }).withMessage('Skill level must be 1 or more').toInt()
];

export const validateCourseParam = validateChain([mongoParam('courseId')]);
export const validateIdParam = validateChain([mongoParam('id')]);
export const validateLinkParam = validateChain([mongoParam('linkId')]);

export const validateCreateModule = validateChain([
  body('course').isMongoId().withMessage('course is required'),
  body('title').isString().trim().notEmpty().withMessage('title is required'),
  body('description').isString().trim().notEmpty().withMessage('description is required'),
  body('order').optional().isInt().toInt()
]);

export const validateUpdateModule = validateChain([
  mongoParam('id'),
  optText('title', 200),
  optText('description'),
  body('order').optional().isInt().toInt(),
  body('isActive').optional().isBoolean().toBoolean()
]);

export const validateCreateSubModule = validateChain([
  body('module').isMongoId().withMessage('module is required'),
  body('title').isString().trim().notEmpty().withMessage('title is required'),
  body('description').isString().trim().notEmpty().withMessage('description is required'),
  body('order').optional().isInt().toInt(),
  body('deadlineDays').optional({ values: 'null' }).isInt({ min: 1, max: 365 }).withMessage('deadlineDays must be 1-365 (days from the module unlock)').toInt(),
  ...skillsRules
]);

export const validateUpdateSubModule = validateChain([
  mongoParam('id'),
  optText('title', 200),
  optText('description'),
  body('order').optional().isInt().toInt(),
  body('deadlineDays').optional({ values: 'null' }).isInt({ min: 1, max: 365 }).withMessage('deadlineDays must be 1-365').toInt(),
  body('isActive').optional().isBoolean().toBoolean(),
  ...skillsRules
]);

// Either reuse an existing item (contentId) or create one (content: {...})
export const validateAddContent = validateChain([
  mongoParam('id'),
  body('contentType').isIn(['video', 'note', 'mcq']).withMessage('contentType must be video, note or mcq'),
  body('contentId').optional().isMongoId().withMessage('Invalid contentId'),
  body('content').optional().isObject().withMessage('content must be an object'),
  body('order').optional().isInt().toInt(),
  body('isNewContent').optional().isBoolean().toBoolean(),
  body().custom(b => {
    if (!b?.contentId && !b?.content) throw new Error('Send contentId (existing item) or content (new item)');
    return true;
  })
]);

export const validateUpdateContent = validateChain([
  mongoParam('linkId'),
  body('order').optional().isInt().toInt(),
  body('isActive').optional().isBoolean().toBoolean(),
  body('isNewContent').optional().isBoolean().toBoolean(),
  body('content').optional().isObject().withMessage('content must be an object')
]);

export const validateSkill = validateChain([
  body('name').optional().isString().trim().notEmpty(),
  body('slug').optional().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('slug: lowercase letters, numbers and hyphens'),
  optText('description', 500),
  optText('icon', 500),
  body('isActive').optional().isBoolean().toBoolean()
]);

export const validateBadge = validateChain([
  body('name').optional().isString().trim().notEmpty(),
  optText('description', 500),
  optText('icon', 500),
  body('ruleType')
    .optional()
    .isIn(['total_xp', 'streak_days', 'projects_approved', 'courses_completed', 'challenges_completed', 'early_finishes'])
    .withMessage('Invalid ruleType'),
  body('threshold').optional().isInt({ min: 1 }).toInt(),
  body('isActive').optional().isBoolean().toBoolean()
]);
