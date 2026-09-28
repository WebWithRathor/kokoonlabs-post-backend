import { Router } from 'express';
import * as C from '../../controllers/private/lms-admin.controller';
import * as V from '../../validators/private/lms-admin.validator';
import * as CX from '../../controllers/private/lms-admin-extra.controller';
import * as VX from '../../validators/private/lms-admin-extra.validator';
import { parseQueryParams } from '../../middlewares/query.middleware';

// Mounted under /api/v1/private/lms — the private router is already
// login + ADMIN only. Every content edit recalculates course totals and
// clears the course cache, so students see changes on their next load.
const router = Router();

router.get('/courses/:courseId/tree', V.validateCourseParam, C.getCourseTree);
router.post('/courses/:courseId/recalculate', V.validateCourseParam, C.recalculateCourse);

router.post('/modules', V.validateCreateModule, C.createModule);
router.put('/modules/:id', V.validateUpdateModule, C.updateModule);

router.post('/sub-modules', V.validateCreateSubModule, C.createSubModule);
router.put('/sub-modules/:id', V.validateUpdateSubModule, C.updateSubModule);
router.post('/sub-modules/:id/contents', V.validateAddContent, C.addContent);

router.put('/contents/:linkId', V.validateUpdateContent, C.updateContent);
router.delete('/contents/:linkId', V.validateLinkParam, C.removeContent);

router.get('/skills', C.listSkills);
router.post('/skills', V.validateSkill, C.createSkill);
router.put('/skills/:id', V.validateIdParam, V.validateSkill, C.updateSkill);

router.get('/badges', C.listBadges);
router.post('/badges', V.validateBadge, C.createBadge);
router.put('/badges/:id', V.validateIdParam, V.validateBadge, C.updateBadge);

router.get('/challenges', VX.validateListQuery, parseQueryParams, CX.listChallenges);
router.post('/challenges', VX.validateCreateChallenge, CX.createChallenge);
router.put('/challenges/:id', VX.validateUpdateChallenge, CX.updateChallenge);

router.get('/announcements', VX.validateListQuery, parseQueryParams, CX.listAnnouncements);
router.post('/announcements', VX.validateCreateAnnouncement, CX.createAnnouncement);
router.put('/announcements/:id', VX.validateUpdateAnnouncement, CX.updateAnnouncement);

export default router;
