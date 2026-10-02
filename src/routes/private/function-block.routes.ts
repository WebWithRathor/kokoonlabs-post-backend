import { Router } from 'express';
import * as C from '../../controllers/private/function-block.controller';
import * as V from '../../validators/private/function-block.validator';
import { parseQueryParams } from '../../middlewares/query.middleware';

// Mounted under /api/v1/private/function-blocks (admins only)
const router = Router();

router.get('/', V.validateList, parseQueryParams, C.list);
router.get('/:id', V.validateId, C.getOne);
router.post('/:id/approve', V.validateApprove, C.approve);
router.post('/:id/reject', V.validateReject, C.reject);
router.delete('/:id', V.validateId, C.remove);

export default router;
