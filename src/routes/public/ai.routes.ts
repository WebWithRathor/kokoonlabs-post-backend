import { Router } from 'express';
import { isAuthenticated, requireRole } from '../../middlewares/auth.middleware';
import { UserRole } from '../../interfaces';
import { buildWithAi, getAiParts, getAiUsage } from '../../controllers/public/ai.controller';
import { validateBuild } from '../../validators/public/ai.validator';

const router = Router();

// The AI project builder: signed-in students (and staff) only
router.use(isAuthenticated, requireRole(UserRole.STUDENT));

router.get('/usage', getAiUsage);
router.get('/parts', getAiParts);
router.post('/build', validateBuild, buildWithAi);

export default router;
