import { Router } from 'express';
import blockRoutes from './block.routes';
import projectRoutes from './project.routes';

const router = Router();

router.use('/blocks', blockRoutes);
router.use('/projects', projectRoutes);

export default router;
