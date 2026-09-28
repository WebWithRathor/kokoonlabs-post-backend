import { Types } from 'mongoose';
import EnrolledCourseLink from '../models/enrollCourseLink.model';
import UserStats from '../models/user-stats.model';
import Submission from '../models/submission.model';
import Challenge from '../models/challenge.model';
import Certificate from '../models/certificate.model';
import Notification from '../models/notification.model';
import {
  IEnrolledCourseLink,
  IEnrolledCourseLinkStatus
} from '../interfaces/enrolled-course-link.interface';
import { IUserSkillLevel } from '../interfaces/lms-progress.interface';
import { IChallenge, ICertificate, INotification, ISubmission } from '../interfaces/lms-rewards.interface';

type Id = Types.ObjectId | string;

// Read-mostly queries behind the home screen, profile and bell icon
export class LmsDashboardDao {
  async listActiveEnrollments(userId: Id): Promise<IEnrolledCourseLink[]> {
    return await EnrolledCourseLink.find({ userId, status: IEnrolledCourseLinkStatus.SUCCESS })
      .select('courseId courseTitle courseThumbnail courseType lastViewedContent lastActivity completedAt purchasedDate')
      .sort({ lastActivity: -1, createdAt: -1 })
      .lean<IEnrolledCourseLink[]>();
  }

  async findStatsWithRefs(userId: Id) {
    return await UserStats.findOne({ user: userId })
      .populate('skills.skill', 'name slug icon')
      .populate('badges.badge', 'name description icon')
      .lean();
  }

  // "My Showcase": approved projects, newest first
  async listApprovedSubmissions(userId: Id, limit: number): Promise<ISubmission[]> {
    return await Submission.find({ user: userId, status: 'approved' })
      .select('challenge challengeType course project projectSnapshot.title videoUrl score xpAwarded reviewedAt createdAt')
      .populate('challenge', 'title type')
      .sort({ reviewedAt: -1, createdAt: -1 })
      .limit(limit)
      .lean<ISubmission[]>();
  }

  async listApprovedChallengeIds(userId: Id): Promise<string[]> {
    const ids = await Submission.distinct('challenge', { user: userId, status: 'approved' });
    return ids.map(String);
  }

  // Skill Challenges the student's levels qualify for + Bonus Missions whose
  // sub-module they have completed
  async listAvailableChallenges(
    skills: IUserSkillLevel[],
    completedSubModuleIds: Id[],
    excludeIds: string[],
    limit: number
  ): Promise<IChallenge[]> {
    const or: Record<string, unknown>[] = skills.map(s => ({
      type: 'global',
      skill: s.skill,
      requiredLevel: { $lte: s.level }
    }));
    if (completedSubModuleIds.length) {
      or.push({ type: 'course', unlockAfterSubModule: { $in: completedSubModuleIds } });
    }
    if (!or.length) return [];
    return await Challenge.find({ isActive: true, _id: { $nin: excludeIds }, $or: or })
      .select('type title description maxXp skill requiredLevel course')
      .populate('skill', 'name')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<IChallenge[]>();
  }

  async listCertificates(userId: Id): Promise<ICertificate[]> {
    return await Certificate.find({ user: userId })
      .select('course type certificateId issueDate fileUrl metadata.courseName')
      .sort({ issueDate: -1 })
      .lean<ICertificate[]>();
  }

  // ---- Bell icon
  async listNotifications(userId: Id, skip: number, limit: number): Promise<INotification[]> {
    return await Notification.find({ user: userId })
      .select('type title body link data readAt createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<INotification[]>();
  }

  async countNotifications(userId: Id): Promise<{ total: number; unread: number }> {
    const [total, unread] = await Promise.all([
      Notification.countDocuments({ user: userId }),
      Notification.countDocuments({ user: userId, readAt: null })
    ]);
    return { total, unread };
  }

  // Marks the given notifications (or all) as read; only the owner's
  async markRead(userId: Id, ids: string[] | 'all'): Promise<number> {
    const filter: Record<string, unknown> = { user: userId, readAt: null };
    if (ids !== 'all') filter._id = { $in: ids };
    const res = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
    return res.modifiedCount;
  }
}

export default new LmsDashboardDao();
