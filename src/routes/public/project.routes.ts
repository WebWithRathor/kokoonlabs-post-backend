import { Router } from 'express';
import {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject
} from '../../controllers/public/project.controller';
import { optionalAuthentication } from '../../middlewares/auth.middleware';

const router = Router();

// Apply optionalAuthentication to populate req.user from session/cookies if present
router.use(optionalAuthentication);

router.post('/', createProject);
router.get('/', listProjects);
router.get('/:id', getProject);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);

export default router;
