import { body, param } from 'express-validator';
import { validateChain } from '../../utils/helper';

export const validateChallengeParam = validateChain([
  param('challengeId').isMongoId().withMessage('Invalid challenge id')
]);

export const validateSubmitProject = validateChain([
  param('challengeId').isMongoId().withMessage('Invalid challenge id'),
  body('projectId').isMongoId().withMessage('Pick one of your projects'),
  body('videoUrl')
    .isURL({ protocols: ['https'], require_protocol: true })
    .withMessage('Add your demo video link (https)')
    .isLength({ max: 2000 })
]);

export const validateSubmissionParam = validateChain([param('id').isMongoId().withMessage('Invalid submission id')]);
