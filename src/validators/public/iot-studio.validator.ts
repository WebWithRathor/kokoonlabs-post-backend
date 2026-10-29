import { body, param } from 'express-validator';
import { validateChain } from '../../utils/helper';
import { IOT_BOARDS, MAX_IOT_VARIABLES } from '../../utils/iot-studio';

const boardName = () =>
  body('name')
    .isString()
    .withMessage('Give the board a name')
    .bail()
    .customSanitizer((v: string) => v.replace(/[\u0000-\u001f\u007f]/g, '').trim())
    .isLength({ min: 1, max: 60 })
    .withMessage('Board names are 1 to 60 characters');

const boardId = () => param('id').isMongoId().withMessage('Invalid board id');

export const validateCreateBoard = validateChain([
  boardName(),
  body('board').isIn([...IOT_BOARDS]).withMessage(`Board type must be one of: ${IOT_BOARDS.join(', ')}`)
]);

export const validateRenameBoard = validateChain([boardId(), boardName()]);

export const validateBoardId = validateChain([boardId()]);

export const validateFlash = validateChain([
  boardId(),
  body('programId').isMongoId().withMessage('Save your project first, then upload it again.'),
  body('version')
    .isString()
    .matches(/^[A-Za-z0-9._-]{1,32}$/)
    .withMessage('Invalid program version'),
  body('variables')
    .isArray({ max: MAX_IOT_VARIABLES })
    .withMessage(`A program can declare at most ${MAX_IOT_VARIABLES} IoT variables`)
]);

export const validateSso = validateChain([body('next').optional().isString().isLength({ max: 200 })]);
