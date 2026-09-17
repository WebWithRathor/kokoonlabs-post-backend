import EnrolledCourseLink from '../models/enrollCourseLink.model';
import {
  IEnrolledCourseLink,
  IEnrolledCourseLinkDao,
  IEnrolledCourseLinkStatus
} from '../interfaces/enrolled-course-link.interface';

export class EnrolledCourseLinkDao implements IEnrolledCourseLinkDao {
  /**
   * Create a new enrolled course link record
   */
  async create(
    data: Partial<IEnrolledCourseLink>
  ): Promise<IEnrolledCourseLink> {
    return await EnrolledCourseLink.create(data);
  }

  /**
   * Find enrolled course link by ID
   */
  async findById(id: string): Promise<IEnrolledCourseLink | null> {
    return await EnrolledCourseLink.findById(id).exec();
  }

  /**
   * Find all enrolled courses for a given user
   */
  async findByUserId(userId: string): Promise<IEnrolledCourseLink[]> {
    return await EnrolledCourseLink.find({ userId })
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Find lightweight enrollment details for a user
   */
  async findEnrollmentByUserId(
    userId: string
  ): Promise<
    Array<
      Pick<
        IEnrolledCourseLink,
        'courseId' | 'courseTitle' | 'courseThumbnail' | 'purchasedDate'
      >
    >
  > {
    return await EnrolledCourseLink.find({ userId })
      .select('courseId courseTitle courseThumbnail purchasedDate')
      .exec();
  }

  /**
   * Find specific enrollment link by user ID and course ID
   */
  async findByUserAndCourse(
    userId: string,
    courseId: string
  ): Promise<IEnrolledCourseLink | null> {
    return await EnrolledCourseLink.findOne({ userId, courseId }).exec();
  }

  /**
   * Increment retry count and update last retry timestamp
   */
  async incrementRetryCount(id: string): Promise<IEnrolledCourseLink | null> {
    return await EnrolledCourseLink.findByIdAndUpdate(
      id,
      {
        $inc: { retryCount: 1 },
        $set: { lastRetryAt: new Date() }
      },
      { new: true }
    ).exec();
  }

  /**
   * Find pending enrollments up to a limit
   */
  async findPendingEnrollments(
    limit: number = 10
  ): Promise<IEnrolledCourseLink[]> {
    return await EnrolledCourseLink.find({
      status: IEnrolledCourseLinkStatus.PENDING
    })
      .limit(limit)
      .exec();
  }

  /**
   * Find failed enrollments where retryCount is less than maxRetries
   */
  async findFailedEnrollments(
    maxRetries: number
  ): Promise<IEnrolledCourseLink[]> {
    return await EnrolledCourseLink.find({
      status: IEnrolledCourseLinkStatus.FAILED,
      retryCount: { $lt: maxRetries }
    }).exec();
  }

  /**
   * Find one document and delete it
   */
  async findOneAndDelete(
    filter: Record<string, unknown> | object
  ): Promise<IEnrolledCourseLink | null> {
    return await EnrolledCourseLink.findOneAndDelete(filter).exec();
  }

  /**
   * Update enrollment status
   */
  async updateStatus(
    id: string,
    status: IEnrolledCourseLinkStatus
  ): Promise<IEnrolledCourseLink | null> {
    return await EnrolledCourseLink.findByIdAndUpdate(
      id,
      { $set: { status } },
      { new: true }
    ).exec();
  }
}

export const enrolledCourseLinkDao = new EnrolledCourseLinkDao();
export default enrolledCourseLinkDao;
