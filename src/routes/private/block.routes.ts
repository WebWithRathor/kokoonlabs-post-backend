import { Router } from 'express';
import {
  createBlock,
  listBlocks,
  getBlock,
  updateBlock,
  deleteBlock
} from '../../controllers/private/block.controller';
import {
  validateCreateBlock,
  validateUpdateBlock,
  validateBlockIdParam,
  validateBlockQuery
} from '../../validators/private/block.validator';
import { parseQueryParams } from '../../middlewares/query.middleware';

const router = Router();

router.post('/', validateCreateBlock, createBlock);
router.get('/', validateBlockQuery, parseQueryParams, listBlocks);
router.get('/:id', validateBlockIdParam, getBlock);
router.put('/:id', validateUpdateBlock, updateBlock);
router.delete('/:id', validateBlockIdParam, deleteBlock);

export default router;
