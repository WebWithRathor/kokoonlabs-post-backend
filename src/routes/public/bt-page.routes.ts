import { Router } from 'express';
import { getBtPageController } from '../../controllers/public/bt-page.controller';
import { validateBtCodeParam } from '../../validators/public/bt-page.validator';

// No login: a student opens their project's Bluetooth page from its link
// (/bt/<code>) on a phone, without the editor
const router = Router();

router.get('/:code', validateBtCodeParam, getBtPageController);

export default router;
