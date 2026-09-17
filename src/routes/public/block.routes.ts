import { Router } from 'express';
import {
  listBlocks,
  getBlock
} from '../../controllers/public/block.controller';
import {
  validatePublicBlockQuery,
  validateBlockParam
} from '../../validators/public/block.validator';
import { parseQueryParams } from '../../middlewares/query.middleware';

const router = Router();

router.get('/', validatePublicBlockQuery, parseQueryParams, listBlocks);
router.get('/:idOrType', validateBlockParam, getBlock);

export default router;
