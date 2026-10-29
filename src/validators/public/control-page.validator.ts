import { body, param, query } from 'express-validator';
import { validateChain } from '../../utils/helper';
import { CONTROL_PAGE_KINDS } from '../../interfaces/control-page.interface';
import { MAX_WIDGETS } from '../../utils/control-page';

const pageId = () => param('id').isMongoId().withMessage('Invalid page id');
const layout = () =>
  body('layout')
    .isObject()
    .withMessage('Send the page')
    .bail()
    .custom((v: { widgets?: unknown }) => Array.isArray(v.widgets) && v.widgets.length <= MAX_WIDGETS)
    .withMessage(`A page has at most ${MAX_WIDGETS} widgets`);
const projectId = () =>
  body('projectId')
    .optional({ values: 'null' })
    .isMongoId()
    .withMessage('Invalid project id');
const name = () => body('name').optional().isString().isLength({ max: 80 }).withMessage('Page names are up to 40 characters');

export const validateListControlPages = validateChain([
  query('kind').optional().isIn(CONTROL_PAGE_KINDS).withMessage('kind is bluetooth or wifi')
]);

export const validateCreateControlPage = validateChain([
  body('kind').isIn(CONTROL_PAGE_KINDS).withMessage('A page is for Bluetooth or WiFi'),
  layout(),
  projectId(),
  name()
]);

export const validateUpdateControlPage = validateChain([pageId(), layout().optional(), projectId(), name()]);

export const validateControlPageId = validateChain([pageId()]);
