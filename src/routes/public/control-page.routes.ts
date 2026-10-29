import { Router } from 'express';
import {
  copyControlPage,
  createControlPage,
  deleteControlPage,
  listControlPages,
  updateControlPage
} from '../../controllers/public/control-page.controller';
import { isAuthenticated, requireRole } from '../../middlewares/auth.middleware';
import { UserRole } from '../../interfaces';
import {
  validateControlPageId,
  validateCreateControlPage,
  validateListControlPages,
  validateUpdateControlPage
} from '../../validators/public/control-page.validator';

// A student's saved Bluetooth / WiFi pages: private to them, like projects
const router = Router();

router.use(isAuthenticated, requireRole(UserRole.STUDENT));

router.get('/', validateListControlPages, listControlPages);
router.post('/', validateCreateControlPage, createControlPage);
router.put('/:id', validateUpdateControlPage, updateControlPage);
router.post('/:id/copy', validateControlPageId, copyControlPage);
router.delete('/:id', validateControlPageId, deleteControlPage);

export default router;
