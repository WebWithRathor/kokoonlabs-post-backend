import { Router } from 'express';
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject
} from '../../controllers/public/project.controller';
import {
  isAuthenticated,
  requireRole
} from '../../middlewares/auth.middleware';
import { UserRole } from '../../interfaces';

const router = Router();

// Projects are private to their owner: a valid login is required, and
// requireRole(STUDENT) also rejects blocked and deleted accounts.
router.use(isAuthenticated, requireRole(UserRole.STUDENT));

router.post('/', createProject);
router.get('/', listProjects);
router.get('/:id', getProject);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);

export default router;
