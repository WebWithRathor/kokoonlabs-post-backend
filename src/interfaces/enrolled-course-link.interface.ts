import { Request } from 'express';
import mongoose, { Document } from 'mongoose';

export interface ILastViewedContent {
  contentId: mongoose.Types.ObjectId | string;
  submoduleId: mongoose.Types.ObjectId | string;
  moduleId: mongoose.Types.ObjectId | string;
  contentType: 'video' | 'note' | 'mcq'; // type of content viewed
  title?: string;
  viewedAt: Date;
}

export type IBatchMode = 'online' | 'offline';

export enum IEnrolledCourseLinkStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  BLOCKED = 'blocked',
  REMOVED = 'removed'
}

export interface IEnrolledCourseLink extends Document {
  userId: mongoose.Types.ObjectId | string;
  courseId: mongoose.Types.ObjectId | string;
  batchId: mongoose.Types.ObjectId | string;
  batchMode: string; // 'online' | 'offline'
  courseTitle: string;
  courseThumbnail: string;
  courseType?: string; // 'online' | 'offline' | 'hybrid'
  isSelfPaced?: boolean;
  selfPacedEnabledAt?: Date;
  purchasedDate: Date;
  /** Resume-learning: the content this user last opened in the course. */
  lastViewedContent?: ILastViewedContent;
  lastActivity?: Date;
  completedAt?: Date | null;
  status: IEnrolledCourseLinkStatus;
  retryCount: number;
  lastRetryAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
export interface IEnrolledCourseLinkDao {
  findByUserId(userId: string): Promise<IEnrolledCourseLink[]>;
  findEnrollmentByUserId(
    userId: string
  ): Promise<
    Array<
      Pick<
        IEnrolledCourseLink,
        'courseId' | 'courseTitle' | 'courseThumbnail' | 'purchasedDate'
      >
    >
  >;
  findByUserAndCourse(
    userId: string,
    courseId: string
  ): Promise<IEnrolledCourseLink | null>;
  incrementRetryCount(id: string): Promise<IEnrolledCourseLink | null>;
  findPendingEnrollments(limit?: number): Promise<IEnrolledCourseLink[]>;
  findFailedEnrollments(maxRetries: number): Promise<IEnrolledCourseLink[]>;
  findOneAndDelete(
    filter: Record<string, unknown> | object
  ): Promise<IEnrolledCourseLink | null>;
}

export interface IEnrollmentDetails {
  batchId: string;
  courseId: string;
  userId: string;
}

export interface RequestWithEnrollment extends Request {
  enrollmentDetails: IEnrolledCourseLink;
}
