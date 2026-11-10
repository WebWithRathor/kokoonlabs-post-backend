import { Router } from 'express';
import { param } from 'express-validator';
import { validateChain } from '../../utils/helper';
import { analyzeAiProfile, deleteAiProfile, listAiProfiles, saveAiProfile, teachAiProfile } from '../../controllers/private/ai-profile.controller';

// "Teach the AI" (admins): what the AI builder knows about each block
const router = Router();
const validateType = validateChain([param('type').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Invalid block type')]);

router.get('/', listAiProfiles);
router.post('/:type/analyze', validateType, analyzeAiProfile);
router.post('/:type/teach', validateType, teachAiProfile);
router.put('/:type', validateType, saveAiProfile);
router.delete('/:type', validateType, deleteAiProfile);

export default router;
