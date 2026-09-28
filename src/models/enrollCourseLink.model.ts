import mongoose, { Schema } from 'mongoose';
import {
  IEnrolledCourseLink,
  IEnrolledCourseLinkStatus
} from '../interfaces/enrolled-course-link.interface';
const enrolledCourseLinkSchema = new Schema<IEnrolledCourseLink>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required']
    },
    courseId: {
      type: Schema.Types.ObjectId,
      ref: 'Course',
      required: [true, 'Course ID is required']
    },
    courseTitle: String,
    courseThumbnail: String,
    courseType: {
      type: String,
      enum: ['self-paced', 'live'],
      default: 'self-paced'
    },
    batchId: {
      type: Schema.Types.ObjectId,
      ref: 'Batch',
      required: [true, 'Batch ID is required']
    },
    batchMode: {
      type: String,
      enum: ['online', 'offline'],
      required: [true, 'Batch mode is required'],
      default: 'online'
    },
    purchasedDate: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: Object.values(IEnrolledCourseLinkStatus),
      default: IEnrolledCourseLinkStatus.PENDING
    },
    retryCount: {
      type: Number,
      default: 0
    },
    lastRetryAt: {
      type: Date
    },
    isSelfPaced: {
      type: Boolean,
      default: false
    },
    selfPacedEnabledAt: {
      type: Date
    },
    // Resume learning: the content this user last opened in the course
    lastViewedContent: {
      type: {
        _id: false,
        contentId: { type: Schema.Types.ObjectId },
        submoduleId: { type: Schema.Types.ObjectId, ref: 'SubModule' },
        moduleId: { type: Schema.Types.ObjectId, ref: 'Module' },
        contentType: { type: String, enum: ['video', 'note', 'mcq'] },
        title: { type: String },
        viewedAt: { type: Date }
      },
      default: null
    },
    lastActivity: {
      type: Date
    },
    // Set when every module of the course is complete
    completedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Create indexes for frequent query patterns
enrolledCourseLinkSchema.index({ userId: 1 });
enrolledCourseLinkSchema.index({ userId: 1, courseId: 1 }); // findByUserAndCourse
enrolledCourseLinkSchema.index({ courseId: 1 });
enrolledCourseLinkSchema.index({ batchId: 1 });
enrolledCourseLinkSchema.index({ status: 1 }); // Index for status queries

export const EnrolledCourseLink = mongoose.model<IEnrolledCourseLink>(
  'EnrolledCourseLink',
  enrolledCourseLinkSchema
);

export default EnrolledCourseLink;
