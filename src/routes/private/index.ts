import { Router } from 'express';
import blockRoutes from './block.routes';

const router = Router();

router.use('/blocks', blockRoutes);

export default router;
