import { param } from 'express-validator';
import { validateChain } from '../../utils/helper';

// Format issued by rewards.service: KL-<year>-<10 hex>
export const validateCertificateParam = validateChain([
  param('certificateId')
    .trim()
    .toUpperCase()
    .matches(/^KL-\d{4}-[0-9A-F]{10}$/)
    .withMessage('Invalid certificate ID')
]);
