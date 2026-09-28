import { Types } from 'mongoose';
import LmsChallengeDao from '../../../dao/lms-challenge.dao';
import LmsEnrollmentDao from '../../../dao/lms-enrollment.dao';
import ProjectDao from '../../../dao/project.dao';
import ErrorHandler from '../../../utils/error-handler';
import { NAMES } from '../../../config/gamification.config';
import { IChallenge, ISubmission } from '../../../interfaces/lms-rewards.interface';

type Id = Types.ObjectId | string;

// Why a student can or can't take a challenge — shown as-is in the UI
interface Eligibility {
  eligible: boolean;
  reason: string | null;
}

// Skill Challenge: level in the skill >= required level.
// Bonus Mission: enrolled in the course and finished its unlocking sub-module.
export const checkEligibility = async (userId: Id, challenge: IChallenge): Promise<Eligibility> => {
  if (!challenge.isActive) return { eligible: false, reason: 'This challenge is closed' };

  if (challenge.type === 'global') {
    const skillId = (challenge.skill as unknown as { _id?: Types.ObjectId })?._id ?? challenge.skill;
    const level = await LmsChallengeDao.skillLevel(userId, skillId as Id);
    const skillName = (challenge.skill as unknown as { name?: string })?.name ?? 'this skill';
    return level >= (challenge.requiredLevel ?? 1)
      ? { eligible: true, reason: null }
      : { eligible: false, reason: `Reach ${skillName} level ${challenge.requiredLevel} to unlock` };
  }

  const enrolled = await LmsEnrollmentDao.findActive(userId, challenge.course as Id);
  if (!enrolled) return { eligible: false, reason: 'Enroll in the course to unlock this Bonus Mission' };
  const done = await LmsChallengeDao.hasCompletedSubModule(userId, challenge.course as Id, challenge.unlockAfterSubModule as Id);
  return done
    ? { eligible: true, reason: null }
    : { eligible: false, reason: 'Finish the lesson before this Bonus Mission to unlock it' };
};

// Whether another attempt is allowed: not after approval, not while one is
// waiting for review, and at most 1 + maxResubmissions attempts in total
export const nextAttempt = (
  attempts: Pick<ISubmission, 'attemptNo' | 'status'>[],
  maxResubmissions: number
): { allowed: boolean; attemptNo: number; attemptsLeft: number; reason: string | null } => {
  const maxAttempts = 1 + maxResubmissions;
  const attemptNo = attempts.length + 1;
  const attemptsLeft = Math.max(0, maxAttempts - attempts.length);
  if (attempts.some(a => a.status === 'approved')) {
    return { allowed: false, attemptNo, attemptsLeft: 0, reason: 'Approved! This one is in your showcase' };
  }
  if (attempts.some(a => a.status === 'pending')) {
    return { allowed: false, attemptNo, attemptsLeft, reason: 'Your mentor is reviewing your project' };
  }
  if (attemptNo > maxAttempts) {
    return { allowed: false, attemptNo, attemptsLeft: 0, reason: 'No tries left for this challenge' };
  }
  return { allowed: true, attemptNo, attemptsLeft, reason: null };
};

const findActiveChallenge = async (challengeId: string): Promise<IChallenge> => {
  const challenge = await LmsChallengeDao.findChallenge(challengeId);
  if (!challenge) throw new ErrorHandler(404, 'Challenge not found');
  return challenge;
};

// ---------------------------------------------------------------------
// Challenge page: details, whether the student can take it, attempt history
// ---------------------------------------------------------------------
export const getChallenge = async (userId: Id, challengeId: string) => {
  const challenge = await findActiveChallenge(challengeId);
  const [eligibility, attempts] = await Promise.all([
    checkEligibility(userId, challenge),
    LmsChallengeDao.listAttempts(challengeId, userId)
  ]);
  // A closed challenge stays visible only to students who worked on it
  if (!challenge.isActive && !attempts.length) {
    throw new ErrorHandler(404, 'Challenge not found');
  }
  const next = nextAttempt(attempts, challenge.maxResubmissions);
  return {
    id: String(challenge._id),
    kind: challenge.type === 'global' ? NAMES.globalChallenge : NAMES.courseChallenge,
    type: challenge.type,
    title: challenge.title,
    description: challenge.description,
    instructions: challenge.instructions,
    maxXp: challenge.maxXp,
    skill: challenge.skill,
    requiredLevel: challenge.requiredLevel,
    courseId: challenge.course ? String(challenge.course) : null,
    eligible: eligibility.eligible,
    lockedReason: eligibility.reason,
    canSubmit: eligibility.eligible && next.allowed,
    submitBlockedReason: eligibility.eligible ? next.reason : eligibility.reason,
    attemptsLeft: next.attemptsLeft,
    attempts: attempts.map(a => ({
      id: String(a._id),
      attemptNo: a.attemptNo,
      status: a.status,
      score: a.score,
      xpAwarded: a.xpAwarded,
      feedback: a.feedback ?? null,
      submittedAt: a.createdAt,
      reviewedAt: a.reviewedAt
    }))
  };
};

// ---------------------------------------------------------------------
// Submit: the student's own block-editor project + a Pixxo demo video.
// The project is copied into the submission, so later edits don't change
// what the mentor reviews.
// ---------------------------------------------------------------------
export const submitProject = async (
  userId: Id,
  challengeId: string,
  body: { projectId: string; videoUrl: string }
) => {
  const challenge = await findActiveChallenge(challengeId);
  const eligibility = await checkEligibility(userId, challenge);
  if (!eligibility.eligible) throw new ErrorHandler(403, eligibility.reason ?? 'Not available yet');

  const attempts = await LmsChallengeDao.listAttempts(challengeId, userId);
  const next = nextAttempt(attempts, challenge.maxResubmissions);
  if (!next.allowed) throw new ErrorHandler(409, next.reason ?? 'You cannot submit right now');

  // Only the student's own project (same rule as the project routes)
  const project = await ProjectDao.findByUserAndId(String(userId), body.projectId);
  if (!project) throw new ErrorHandler(404, 'Project not found');

  const submission = await LmsChallengeDao.createSubmission({
    challenge: challenge._id as Types.ObjectId,
    user: new Types.ObjectId(String(userId)),
    challengeType: challenge.type,
    course: challenge.course ?? null,
    attemptNo: next.attemptNo,
    project: project._id as Types.ObjectId,
    projectSnapshot: {
      title: project.title,
      nodes: project.nodes ?? [],
      edges: project.edges ?? [],
      code: project.code ?? ''
    },
    videoUrl: body.videoUrl,
    status: 'pending'
  });
  if (!submission) throw new ErrorHandler(409, 'That attempt was already submitted');

  return {
    id: String(submission._id),
    attemptNo: submission.attemptNo,
    status: submission.status,
    message: 'Submitted! Your mentor will review it soon 🚀'
  };
};

// A student's own submission, including the frozen project copy
export const getMySubmission = async (userId: Id, submissionId: string) => {
  const submission = await LmsChallengeDao.findSubmission(submissionId, userId);
  if (!submission) throw new ErrorHandler(404, 'Submission not found');
  return submission;
};
