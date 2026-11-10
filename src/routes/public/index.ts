import { Router } from 'express';
import blockRoutes from './block.routes';
import projectRoutes from './project.routes';
import lmsRoutes from './lms.routes';
import certificateRoutes from './certificate.routes';
import functionBlockRoutes from './function-block.routes';
import btPageRoutes from './bt-page.routes';
import iotStudioRoutes from './iot-studio.routes';
import controlPageRoutes from './control-page.routes';
import aiRoutes from './ai.routes';

const router = Router();

router.use('/blocks', blockRoutes);
router.use('/projects', projectRoutes);
router.use('/lms', lmsRoutes);
router.use('/certificates', certificateRoutes);
router.use('/function-blocks', functionBlockRoutes);
router.use('/bt-pages', btPageRoutes);
router.use('/iot-studio', iotStudioRoutes);
router.use('/control-pages', controlPageRoutes);
router.use('/ai', aiRoutes);

export default router;
