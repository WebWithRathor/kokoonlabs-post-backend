import { Router } from 'express';
import blockRoutes from './block.routes';
import lmsAdminRoutes from './lms.routes';
import functionBlockRoutes from './function-block.routes';
import aiProfileRoutes from './ai-profile.routes';
import componentRoutes from './component.routes';
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
router.use('/ai/block-profiles', aiProfileRoutes);
router.use('/components', componentRoutes);

export default router;
