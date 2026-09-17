import mongoose, { Document } from 'mongoose';

export type IBatchMode = 'online' | 'offline';
export type ICourseType = 'self-paced' | 'live';

export enum IEnrolledCourseLinkStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  BLOCKED = 'blocked',
  REMOVED = 'removed'
}

export interface IEnrolledCourseLink extends Document {
  userId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  batchId: mongoose.Types.ObjectId;
  courseTitle?: string;
  courseThumbnail?: string;
  courseType?: ICourseType;
  batchMode: IBatchMode;
  purchasedDate: Date;
  status: IEnrolledCourseLinkStatus;
  retryCount: number;
  lastRetryAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEnrolledCourseLinkDao {
  create(data: Partial<IEnrolledCourseLink>): Promise<IEnrolledCourseLink>;
  findById(id: string): Promise<IEnrolledCourseLink | null>;
  findByUserId(userId: string): Promise<IEnrolledCourseLink[]>;
  findEnrollmentByUserId(
    userId: string
  ): Promise<
    Array<Pick<IEnrolledCourseLink, 'courseId' | 'courseTitle' | 'courseThumbnail' | 'purchasedDate'>>
  >;
  findByUserAndCourse(userId: string, courseId: string): Promise<IEnrolledCourseLink | null>;
  incrementRetryCount(id: string): Promise<IEnrolledCourseLink | null>;
  findPendingEnrollments(limit?: number): Promise<IEnrolledCourseLink[]>;
  findFailedEnrollments(maxRetries: number): Promise<IEnrolledCourseLink[]>;
  findOneAndDelete(filter: Record<string, unknown> | object): Promise<IEnrolledCourseLink | null>;
  updateStatus(id: string, status: IEnrolledCourseLinkStatus): Promise<IEnrolledCourseLink | null>;
}
