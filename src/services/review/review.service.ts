import { Types } from 'mongoose';
import LmsChallengeDao from '../../dao/lms-challenge.dao';
import LmsRewardsDao from '../../dao/lms-rewards.dao';
import ErrorHandler from '../../utils/error-handler';
import { COPY } from '../../config/gamification.config';
import { IChallenge, ISubmission, SubmissionStatus } from '../../interfaces/lms-rewards.interface';
import { pagination } from '../../interfaces/common.interface';
import { addXp, checkBadges, levelChange, notifyLevelUp } from '../public/lms/rewards.service';

type Id = Types.ObjectId | string;
const idOf = (ref: unknown): string => String((ref as { _id?: unknown })?._id ?? ref);

// ---------------------------------------------------------------------
// Queue: pending oldest first; approved/rejected newest first
// ---------------------------------------------------------------------
export const listSubmissions = async (
  status: SubmissionStatus,
  filters: { challengeId?: string; courseId?: string },
  page: { page: number; limit: number; skip: number }
): Promise<{ submissions: ISubmission[]; pagination: pagination }> => {
  const filter: Record<string, unknown> = {};
  if (filters.challengeId) filter.challenge = new Types.ObjectId(filters.challengeId);
  if (filters.courseId) filter.course = new Types.ObjectId(filters.courseId);
  const { items, total } = await LmsChallengeDao.listForReview(status, filter, page.skip, page.limit);
  return {
    submissions: items,
    pagination: { currentPage: page.page, total, limit: page.limit, totalPages: Math.ceil(total / page.limit) }
  };
};

// One submission with its frozen project, plus the student's earlier attempts
export const getSubmission = async (id: string) => {
  const submission = await LmsChallengeDao.findSubmission(id);
  if (!submission) throw new ErrorHandler(404, 'Submission not found');
  const history = await LmsChallengeDao.listAttempts(idOf(submission.challenge), idOf(submission.user));
  return { submission, history: history.filter(h => String(h._id) !== id) };
};

const loadForReview = async (id: string): Promise<{ submission: ISubmission; challenge: IChallenge }> => {
  const submission = await LmsChallengeDao.findSubmission(id);
  if (!submission) throw new ErrorHandler(404, 'Submission not found');
  if (submission.status !== 'pending') throw new ErrorHandler(409, 'This submission was already reviewed');
  const challenge = await LmsChallengeDao.findChallenge(idOf(submission.challenge));
  if (!challenge) throw new ErrorHandler(404, 'Challenge not found');
  return { submission, challenge };
};

// ---------------------------------------------------------------------
// Approve: score (0..maxXp) becomes XP; notifies the student; checks badges
// ---------------------------------------------------------------------
export const approveSubmission = async (id: string, reviewerId: Id, score: number, feedback?: string) => {
  const { submission, challenge } = await loadForReview(id);
  if (score < 0 || score > challenge.maxXp) {
    throw new ErrorHandler(400, `Score must be between 0 and ${challenge.maxXp}`);
  }

  const approved = await LmsChallengeDao.approve(id, reviewerId, score, feedback);
  if (!approved) throw new ErrorHandler(409, 'This submission was already reviewed');
  const studentId = idOf(submission.user);

  const totals = await addXp(studentId, score);
  const change = totals ? levelChange(totals.totalXp, score) : null;

  await LmsRewardsDao.notifyOnce([
    {
      user: new Types.ObjectId(studentId),
      type: 'project_reviewed',
      title: COPY.projectApproved(score),
      body: feedback,
      data: { submissionId: id, challengeId: String(challenge._id), status: 'approved', score },
      link: `/challenges/${challenge._id}`,
      dedupeKey: `review:${id}`
    }
  ]);
  if (change) await notifyLevelUp(studentId, change);

  const counts = await LmsChallengeDao.countApproved(studentId);
  const badges = await checkBadges(studentId, {
    projects_approved: counts.projects,
    challenges_completed: counts.challenges
  });

  return { submission: approved, xpAwarded: score, level: change, badgesEarned: badges.map(b => b.name) };
};

// ---------------------------------------------------------------------
// Needs changes: feedback is required so the student knows what to fix
// ---------------------------------------------------------------------
export const rejectSubmission = async (id: string, reviewerId: Id, feedback: string) => {
  const { submission, challenge } = await loadForReview(id);
  const rejected = await LmsChallengeDao.reject(id, reviewerId, feedback);
  if (!rejected) throw new ErrorHandler(409, 'This submission was already reviewed');

  const triesLeft = Math.max(0, 1 + challenge.maxResubmissions - submission.attemptNo);
  await LmsRewardsDao.notifyOnce([
    {
      user: new Types.ObjectId(idOf(submission.user)),
      type: 'project_reviewed',
      title: triesLeft > 0 ? COPY.projectNeedsChanges(triesLeft) : 'Your mentor left feedback on your project',
      body: feedback,
      data: { submissionId: id, challengeId: String(challenge._id), status: 'rejected', triesLeft },
      link: `/challenges/${challenge._id}`,
      dedupeKey: `review:${id}`
    }
  ]);
  return { submission: rejected, triesLeft };
};
