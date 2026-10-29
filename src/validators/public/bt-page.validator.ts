import { param } from 'express-validator';
import { validateChain } from '../../utils/helper';
import { BT_CODE_RE, normalizeBtCode } from '../../utils/bt-page';

// The code from a /bt/<code> link, typed any way: K7X2-PQ9M, k7x2pq9m
export const validateBtCodeParam = validateChain([
  param('code')
    .customSanitizer(normalizeBtCode)
    .matches(BT_CODE_RE)
    .withMessage('Invalid Bluetooth page code')
]);
