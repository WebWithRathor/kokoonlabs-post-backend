import { Types } from 'mongoose';
import EnrolledCourseLink from '../models/enrollCourseLink.model';
import {
  IEnrolledCourseLink,
  IEnrolledCourseLinkStatus,
  ILastViewedContent
} from '../interfaces/enrolled-course-link.interface';

type Id = Types.ObjectId | string;

// Course access lasts until expiresAt (null: no end, e.g. older enrollments).
// An hourly job also flips ended ones to "expired"; this covers the gap.
export const openEnrollmentFilter = (now: Date = new Date()) => ({
  status: IEnrolledCourseLinkStatus.SUCCESS,
  $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
});

// LMS-side reads/writes on the enrollment created by the pre-purchase side
export class LmsEnrollmentDao {
  async findActive(userId: Id, courseId: Id): Promise<IEnrolledCourseLink | null> {
    return await EnrolledCourseLink.findOne({ userId, courseId, ...openEnrollmentFilter() }).lean<IEnrolledCourseLink>();
  }

  // The access that ran out, if that's why there's no open enrollment
  async findEnded(userId: Id, courseId: Id, now: Date = new Date()): Promise<IEnrolledCourseLink | null> {
    return await EnrolledCourseLink.findOne({
      userId,
      courseId,
      $or: [
        { status: IEnrolledCourseLinkStatus.EXPIRED },
        { status: IEnrolledCourseLinkStatus.SUCCESS, expiresAt: { $ne: null, $lte: now } }
      ]
    })
      .sort({ expiresAt: -1 })
      .lean<IEnrolledCourseLink>();
  }

  // Hourly: access past its end date becomes "expired"
  async expireEnded(now: Date = new Date()): Promise<number> {
    const res = await EnrolledCourseLink.updateMany(
      { status: IEnrolledCourseLinkStatus.SUCCESS, expiresAt: { $ne: null, $lte: now } },
      { $set: { status: IEnrolledCourseLinkStatus.EXPIRED } }
    );
    return res.modifiedCount;
  }

  async setLastViewed(userId: Id, courseId: Id, lastViewedContent: ILastViewedContent): Promise<void> {
    await EnrolledCourseLink.updateOne(
      { userId, courseId, ...openEnrollmentFilter() },
      { $set: { lastViewedContent, lastActivity: new Date() } }
    );
  }

  // Guarded: only the first call marks the course complete
  async markCompleted(userId: Id, courseId: Id, now: Date): Promise<boolean> {
    const res = await EnrolledCourseLink.updateOne(
      { userId, courseId, ...openEnrollmentFilter(now), completedAt: null },
      { $set: { completedAt: now } }
    );
    return res.modifiedCount === 1;
  }
}

export default new LmsEnrollmentDao();
