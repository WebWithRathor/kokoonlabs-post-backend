import { Router } from 'express';
import blockRoutes from './block.routes';
import projectRoutes from './project.routes';
import lmsRoutes from './lms.routes';
import certificateRoutes from './certificate.routes';
import functionBlockRoutes from './function-block.routes';

const router = Router();

router.use('/blocks', blockRoutes);
router.use('/projects', projectRoutes);
router.use('/lms', lmsRoutes);
router.use('/certificates', certificateRoutes);
router.use('/function-blocks', functionBlockRoutes);

export default router;
