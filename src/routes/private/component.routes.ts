import { Router } from 'express';
import {
  createComponent,
  importAllComponents,
  linkBlockToComponent,
  listAllComponents,
  removeComponent,
  unlinkBlockEverywhere,
  updateComponent
} from '../../controllers/private/component.controller';

// Admin > Components: the kit's components and the blocks that drive them
const router = Router();

router.get('/', listAllComponents);
router.post('/', createComponent);
router.post('/import', importAllComponents);
router.delete('/blocks/:blockType', unlinkBlockEverywhere);
router.put('/:key', updateComponent);
router.delete('/:key', removeComponent);
router.put('/:key/blocks/:blockType', linkBlockToComponent);

export default router;
