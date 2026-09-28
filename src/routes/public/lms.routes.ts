import { Router } from 'express';
import { isAuthenticated, requireRole } from '../../middlewares/auth.middleware';
import { requireEnrollment } from '../../middlewares/enrollment.middleware';
import { UserRole } from '../../interfaces';
import {
  getOutlineController,
  getPlaybackController,
  getSubModuleController,
  markNoteDoneController,
  openContentController,
  startCourseController,
  submitMcqAttemptController,
  videoHeartbeatController
} from '../../controllers/public/lms.controller';
import {
  validateContentParam,
  validateCourseParam,
  validateHeartbeat,
  validateMcqAttempt,
  validateSubModuleParam
} from '../../validators/public/lms.validator';
import {
  getHomeController,
  getProfileController,
  listNotificationsController,
  markNotificationsReadController
} from '../../controllers/public/lms-dashboard.controller';
import { validateMarkRead, validateNotificationList } from '../../validators/public/lms-dashboard.validator';
import { parseQueryParams } from '../../middlewares/query.middleware';
import { downloadCertificateController } from '../../controllers/public/certificate.controller';
import { validateCertificateParam } from '../../validators/public/certificate.validator';
import {
  getChallengeController,
  getMySubmissionController,
  submitProjectController
} from '../../controllers/public/lms-challenge.controller';
import {
  validateChallengeParam,
  validateSubmissionParam,
  validateSubmitProject
} from '../../validators/public/lms-challenge.validator';

const router = Router();

// Logged in (not blocked/deleted), then enrolled in :courseId
router.use(isAuthenticated, requireRole(UserRole.STUDENT));

// Home screen, profile + heatmap, bell icon
router.get('/home', getHomeController);
router.get('/profile', getProfileController);
router.get('/notifications', validateNotificationList, parseQueryParams, listNotificationsController);
router.post('/notifications/read', validateMarkRead, markNotificationsReadController);

// Challenges and project submissions
router.get('/challenges/:challengeId', validateChallengeParam, getChallengeController);
router.post('/challenges/:challengeId/submissions', validateSubmitProject, submitProjectController);
router.get('/submissions/:id', validateSubmissionParam, getMySubmissionController);

// Certificate PDF (owner only)
router.get('/certificates/:certificateId/pdf', validateCertificateParam, downloadCertificateController);

const course = '/courses/:courseId';

router.post(`${course}/start`, validateCourseParam, requireEnrollment, startCourseController);
router.get(`${course}/outline`, validateCourseParam, requireEnrollment, getOutlineController);
router.get(`${course}/sub-modules/:subModuleId`, validateSubModuleParam, requireEnrollment, getSubModuleController);
router.get(`${course}/contents/:linkId`, validateContentParam, requireEnrollment, openContentController);
router.get(`${course}/contents/:linkId/playback`, validateContentParam, requireEnrollment, getPlaybackController);
router.post(`${course}/contents/:linkId/heartbeat`, validateHeartbeat, requireEnrollment, videoHeartbeatController);
router.post(`${course}/contents/:linkId/done`, validateContentParam, requireEnrollment, markNoteDoneController);
router.post(`${course}/contents/:linkId/attempt`, validateMcqAttempt, requireEnrollment, submitMcqAttemptController);

export default router;
