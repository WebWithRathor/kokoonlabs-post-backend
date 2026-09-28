import { Router } from 'express';
import { isAuthenticated, requireSpecificRoles } from '../../middlewares/auth.middleware';
import { parseQueryParams } from '../../middlewares/query.middleware';
import { UserRole } from '../../interfaces';
import {
  approveSubmissionController,
  getSubmissionController,
  listSubmissionsController,
  rejectSubmissionController
} from '../../controllers/review/review.controller';
import {
  validateApprove,
  validateReject,
  validateReviewList,
  validateSubmissionId
} from '../../validators/review/review.validator';

// Mentor review of challenge projects — /api/v1/review.
// Named roles only (the role hierarchy would also let sales/support in).
const router = Router();

router.use(
  isAuthenticated,
  requireSpecificRoles([UserRole.MENTOR, UserRole.INSTRUCTOR, UserRole.ADMIN, UserRole.SUPER_ADMIN])
);

router.get('/submissions', validateReviewList, parseQueryParams, listSubmissionsController);
router.get('/submissions/:id', validateSubmissionId, getSubmissionController);
router.post('/submissions/:id/approve', validateApprove, approveSubmissionController);
router.post('/submissions/:id/reject', validateReject, rejectSubmissionController);

export default router;
