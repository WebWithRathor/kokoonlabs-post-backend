import { Types } from 'mongoose';
import Challenge from '../models/challenge.model';
import Submission from '../models/submission.model';
import UserStats from '../models/user-stats.model';
import UserProgress from '../models/user-progress.model';
import { IChallenge, ISubmission, SubmissionStatus } from '../interfaces/lms-rewards.interface';
import { IUserProgress, IUserStats } from '../interfaces/lms-progress.interface';

type Id = Types.ObjectId | string;

export class LmsChallengeDao {
  // ---- Challenges
  async findChallenge(id: Id): Promise<IChallenge | null> {
    if (!Types.ObjectId.isValid(String(id))) return null;
    return await Challenge.findById(id).populate('skill', 'name slug').lean<IChallenge>();
  }

  async createChallenge(data: Partial<IChallenge>) {
    return (await Challenge.create(data)).toObject() as IChallenge;
  }

  // save() so the global/course field checks run
  async updateChallenge(id: Id, data: Partial<IChallenge>): Promise<IChallenge | null> {
    const doc = await Challenge.findById(id);
    if (!doc) return null;
    doc.set(data);
    await doc.save();
    return doc.toObject() as IChallenge;
  }

  async listChallenges(filter: Record<string, unknown>, skip: number, limit: number) {
    const [items, total] = await Promise.all([
      Challenge.find(filter).populate('skill', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit).lean<IChallenge[]>(),
      Challenge.countDocuments(filter)
    ]);
    return { items, total };
  }

  // Students whose level in `skill` is at least `level` (for new Skill Challenge notices)
  skillHoldersCursor(skillId: Id, level: number) {
    return UserStats.find({ skills: { $elemMatch: { skill: skillId, level: { $gte: level } } } })
      .select('user')
      .lean<IUserStats[]>()
      .cursor();
  }

  // ---- Eligibility inputs
  async skillLevel(userId: Id, skillId: Id): Promise<number> {
    const stats = await UserStats.findOne({ user: userId }).select('skills').lean<IUserStats>();
    return stats?.skills.find(s => String(s.skill) === String(skillId))?.level ?? 0;
  }

  async hasCompletedSubModule(userId: Id, courseId: Id, subModuleId: Id): Promise<boolean> {
    const doc = await UserProgress.exists({
      user: userId,
      course: courseId,
      subModuleProgress: { $elemMatch: { subModule: subModuleId, completedAt: { $ne: null } } }
    });
    return !!doc;
  }

  async findProgress(userId: Id, courseId: Id): Promise<IUserProgress | null> {
    return await UserProgress.findOne({ user: userId, course: courseId }).select('_id').lean<IUserProgress>();
  }

  // ---- Submissions (student)
  async listAttempts(challengeId: Id, userId: Id): Promise<ISubmission[]> {
    return await Submission.find({ challenge: challengeId, user: userId })
      .select('-projectSnapshot')
      .sort({ attemptNo: 1 })
      .lean<ISubmission[]>();
  }

  // Unique index (challenge, user, attemptNo): a double submit returns null
  async createSubmission(data: Partial<ISubmission>): Promise<ISubmission | null> {
    try {
      return (await Submission.create(data)).toObject() as ISubmission;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return null;
      throw e;
    }
  }

  async findSubmission(id: Id, userId?: Id): Promise<ISubmission | null> {
    if (!Types.ObjectId.isValid(String(id))) return null;
    const filter: Record<string, unknown> = { _id: id };
    if (userId) filter.user = userId;
    return await Submission.findOne(filter)
      .populate('challenge', 'title type maxXp maxResubmissions description')
      .populate('user', 'name')
      .populate('reviewedBy', 'name')
      .lean<ISubmission>();
  }

  // ---- Review queue (mentor)
  async listForReview(status: SubmissionStatus, filter: Record<string, unknown>, skip: number, limit: number) {
    const query = { status, ...filter };
    const [items, total] = await Promise.all([
      Submission.find(query)
        .select('-projectSnapshot.nodes -projectSnapshot.edges -projectSnapshot.code')
        .populate('challenge', 'title type maxXp')
        .populate('user', 'name')
        // Pending: oldest first (fair queue). Reviewed: newest first.
        .sort(status === 'pending' ? { createdAt: 1 } : { reviewedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean<ISubmission[]>(),
      Submission.countDocuments(query)
    ]);
    return { items, total };
  }

  // Guarded: only a pending submission can be reviewed, and only once
  async approve(id: Id, reviewerId: Id, score: number, feedback?: string): Promise<ISubmission | null> {
    return await Submission.findOneAndUpdate(
      { _id: id, status: 'pending' },
      { $set: { status: 'approved', score, xpAwarded: score, feedback, reviewedBy: reviewerId, reviewedAt: new Date() } },
      { new: true }
    ).lean<ISubmission>();
  }

  async reject(id: Id, reviewerId: Id, feedback: string): Promise<ISubmission | null> {
    return await Submission.findOneAndUpdate(
      { _id: id, status: 'pending' },
      { $set: { status: 'rejected', score: 0, xpAwarded: 0, feedback, reviewedBy: reviewerId, reviewedAt: new Date() } },
      { new: true }
    ).lean<ISubmission>();
  }

  async countApproved(userId: Id): Promise<{ projects: number; challenges: number }> {
    const [projects, challenges] = await Promise.all([
      Submission.countDocuments({ user: userId, status: 'approved' }),
      Submission.distinct('challenge', { user: userId, status: 'approved' })
    ]);
    return { projects, challenges: challenges.length };
  }
}

export default new LmsChallengeDao();
