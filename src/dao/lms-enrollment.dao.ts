import { Types } from 'mongoose';
import EnrolledCourseLink from '../models/enrollCourseLink.model';
import {
  IEnrolledCourseLink,
  IEnrolledCourseLinkStatus,
  ILastViewedContent
} from '../interfaces/enrolled-course-link.interface';

type Id = Types.ObjectId | string;

// LMS-side reads/writes on the enrollment created by the pre-purchase side
export class LmsEnrollmentDao {
  async findActive(userId: Id, courseId: Id): Promise<IEnrolledCourseLink | null> {
    return await EnrolledCourseLink.findOne({
      userId,
      courseId,
      status: IEnrolledCourseLinkStatus.SUCCESS
    }).lean<IEnrolledCourseLink>();
  }

  async setLastViewed(userId: Id, courseId: Id, lastViewedContent: ILastViewedContent): Promise<void> {
    await EnrolledCourseLink.updateOne(
      { userId, courseId, status: IEnrolledCourseLinkStatus.SUCCESS },
      { $set: { lastViewedContent, lastActivity: new Date() } }
    );
  }

  // Guarded: only the first call marks the course complete
  async markCompleted(userId: Id, courseId: Id, now: Date): Promise<boolean> {
    const res = await EnrolledCourseLink.updateOne(
      { userId, courseId, status: IEnrolledCourseLinkStatus.SUCCESS, completedAt: null },
      { $set: { completedAt: now } }
    );
    return res.modifiedCount === 1;
  }
}

export default new LmsEnrollmentDao();
