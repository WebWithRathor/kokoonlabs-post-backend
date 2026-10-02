import { Router } from 'express';
import * as C from '../../controllers/public/function-block.controller';
import * as V from '../../validators/public/function-block.validator';
import { isAuthenticated, requireRole } from '../../middlewares/auth.middleware';
import { parseQueryParams } from '../../middlewares/query.middleware';
import { UserRole } from '../../interfaces';

// Student function library — /api/v1/public/function-blocks
const router = Router();

router.use(isAuthenticated, requireRole(UserRole.STUDENT));

router.get('/mine', C.listMine);
router.get('/community', V.validateCommunityQuery, parseQueryParams, C.listCommunity);
router.post('/', V.validateCreate, C.create);
router.get('/:id', V.validateId, C.getOne);
router.put('/:id', V.validateUpdate, C.update);
router.delete('/:id', V.validateId, C.remove);
router.post('/:id/publish', V.validateId, C.requestPublish);
router.post('/:id/withdraw', V.validateId, C.withdraw);

export default router;
