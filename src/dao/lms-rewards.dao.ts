import { Types } from 'mongoose';
import Badge from '../models/badge.model';
import Certificate from '../models/certificate.model';
import Challenge from '../models/challenge.model';
import Notification from '../models/notification.model';
import Submission from '../models/submission.model';
import {
  BadgeRuleType,
  CertificateType,
  IBadge,
  ICertificate,
  IChallenge,
  INotification
} from '../interfaces/lms-rewards.interface';

type Id = Types.ObjectId | string;

export class LmsRewardsDao {
  // ---- Badges
  async findEarnableBadges(ownedIds: Id[], values: Partial<Record<BadgeRuleType, number>>): Promise<IBadge[]> {
    const rules = (Object.entries(values) as [BadgeRuleType, number][]).map(([ruleType, value]) => ({
      ruleType,
      threshold: { $lte: value }
    }));
    if (!rules.length) return [];
    return await Badge.find({ isActive: true, _id: { $nin: ownedIds }, $or: rules }).lean<IBadge[]>();
  }

  // ---- Certificates
  async findCertificateTypes(userId: Id, courseId: Id): Promise<CertificateType[]> {
    const certs = await Certificate.find({ user: userId, course: courseId }).select('type').lean<ICertificate[]>();
    return certs.map(c => c.type);
  }

  // Unique index (user, course, type) makes this safe to call twice
  async createCertificate(data: Partial<ICertificate>): Promise<ICertificate | null> {
    try {
      return (await Certificate.create(data)).toObject() as ICertificate;
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return null;
      throw e;
    }
  }

  async countCompletionCertificates(userId: Id): Promise<number> {
    return await Certificate.countDocuments({ user: userId, type: 'progress' });
  }

  // ---- Challenges / submissions (counts for badges; unlocks for notifications)
  async findCourseChallengesUnlockedBy(subModuleId: Id): Promise<IChallenge[]> {
    return await Challenge.find({ type: 'course', unlockAfterSubModule: subModuleId, isActive: true })
      .select('title')
      .lean<IChallenge[]>();
  }

  async countApprovedProjects(userId: Id): Promise<number> {
    return await Submission.countDocuments({ user: userId, status: 'approved' });
  }

  async countCompletedChallenges(userId: Id): Promise<number> {
    const ids = await Submission.distinct('challenge', { user: userId, status: 'approved' });
    return ids.length;
  }

  async sumApprovedXp(userId: Id): Promise<number> {
    const [row] = await Submission.aggregate<{ xp: number }>([
      { $match: { user: new Types.ObjectId(String(userId)), status: 'approved' } },
      { $group: { _id: null, xp: { $sum: '$xpAwarded' } } }
    ]);
    return row?.xp ?? 0;
  }

  // ---- Notifications: dedupeKey makes each event notify once
  async notifyOnce(docs: Partial<INotification>[]): Promise<void> {
    if (!docs.length) return;
    await Notification.insertMany(docs, { ordered: false }).catch((e: { code?: number; writeErrors?: { code?: number }[] }) => {
      const onlyDuplicates =
        e.code === 11000 || (Array.isArray(e.writeErrors) && e.writeErrors.every(w => w.code === 11000));
      if (!onlyDuplicates) throw e;
    });
  }
}

export default new LmsRewardsDao();
