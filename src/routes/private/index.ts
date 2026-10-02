import { Router } from 'express';
import blockRoutes from './block.routes';
import lmsAdminRoutes from './lms.routes';
import functionBlockRoutes from './function-block.routes';
import {
  isAuthenticated,
  requireRole
} from '../../middlewares/auth.middleware';
import { UserRole } from '../../interfaces';

const router = Router();

router.use(isAuthenticated, requireRole(UserRole.ADMIN));

router.use('/blocks', blockRoutes);
router.use('/lms', lmsAdminRoutes);
router.use('/function-blocks', functionBlockRoutes);

export default router;
