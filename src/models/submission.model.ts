import mongoose, { Schema } from 'mongoose';
import { ISubmission } from '../interfaces/lms-rewards.interface';

// One document per attempt. "My Showcase" = this student's approved submissions.
const submissionSchema = new Schema<ISubmission>(
  {
    challenge: { type: Schema.Types.ObjectId, ref: 'Challenge', required: [true, 'Challenge reference is required'] },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'User reference is required'] },
    challengeType: { type: String, enum: ['global', 'course'], required: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    attemptNo: { type: Number, required: true, min: [1, 'Attempt number starts at 1'] },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: [true, 'Project is required'] },
    // Frozen at submit time: mentors review exactly what was submitted
    projectSnapshot: {
      title: { type: String, default: '' },
      nodes: { type: [Schema.Types.Mixed], default: [] },
      edges: { type: [Schema.Types.Mixed], default: [] },
      code: { type: String, default: '' }
    },
    videoUrl: {
      type: String,
      required: [true, 'Project video is required'],
      trim: true,
      match: [/^https?:\/\/.+/i, 'Video URL must be a valid URL']
    },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    score: { type: Number, min: [0, 'Score cannot be negative'], default: null },
    xpAwarded: { type: Number, default: 0 },
    feedback: { type: String, trim: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null }
  },
  { timestamps: true, minimize: false }
);

submissionSchema.index({ challenge: 1, user: 1, attemptNo: 1 }, { unique: true });
submissionSchema.index({ user: 1, status: 1, createdAt: -1 });
submissionSchema.index({ status: 1, createdAt: 1 }, { partialFilterExpression: { status: 'pending' } });

export const Submission = mongoose.model<ISubmission>('Submission', submissionSchema);
export default Submission;
