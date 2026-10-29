import { Router } from 'express';
import {
  boardStatus,
  createBoard,
  getIotConfig,
  listBoards,
  prepareFlash,
  removeBoard,
  renameBoard,
  resetBoard,
  ssoToken
} from '../../controllers/public/iot-studio.controller';
import { isAuthenticated, requireRole } from '../../middlewares/auth.middleware';
import { UserRole } from '../../interfaces';
import {
  validateBoardId,
  validateCreateBoard,
  validateFlash,
  validateRenameBoard,
  validateSso
} from '../../validators/public/iot-studio.validator';

// Kokoon IoT Studio: a student's boards, flashing, live status and sign-in.
// Every route needs a login; each student only reaches their own boards.
const router = Router();

router.use(isAuthenticated, requireRole(UserRole.STUDENT));

router.get('/config', getIotConfig);
router.get('/boards', listBoards);
router.post('/boards', validateCreateBoard, createBoard);
router.patch('/boards/:id', validateRenameBoard, renameBoard);
router.delete('/boards/:id', validateBoardId, removeBoard);
router.get('/boards/:id/status', validateBoardId, boardStatus);
router.post('/boards/:id/reset', validateBoardId, resetBoard);
router.post('/boards/:id/flash', validateFlash, prepareFlash);
router.post('/sso', validateSso, ssoToken);

export default router;
