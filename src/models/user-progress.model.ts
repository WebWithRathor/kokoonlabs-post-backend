import mongoose, { Schema } from 'mongoose';
import { IUserProgress } from '../interfaces/lms-progress.interface';

const { ObjectId } = Schema.Types;

// One document per student per course. Unlocks, deadlines and content
// progress all live here, so each completion step is one atomic write.
const userProgressSchema = new Schema<IUserProgress>(
  {
    user: { type: ObjectId, ref: 'User', required: [true, 'User reference is required'] },
    course: { type: ObjectId, ref: 'Course', required: [true, 'Course reference is required'] },
    overallProgress: { type: Number, default: 0, min: 0, max: 100 },
    totalPointsEarned: { type: Number, default: 0 },
    xpEarned: { type: Number, default: 0 },
    bonusXpEarned: { type: Number, default: 0 },

    // Entry exists only once the module is unlocked
    moduleProgress: [
      {
        _id: false,
        module: { type: ObjectId, ref: 'Module', required: true },
        unlockedAt: { type: Date, default: Date.now },
        completedAt: { type: Date, default: null },
        xpAwarded: { type: Number, default: 0 }
      }
    ],

    // All active sub-modules are added when their module unlocks
    subModuleProgress: [
      {
        _id: false,
        subModule: { type: ObjectId, ref: 'SubModule', required: true },
        module: { type: ObjectId, ref: 'Module', required: true },
        unlockedAt: { type: Date, default: Date.now },
        deadlineAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        xpAwarded: { type: Number, default: 0 },
        bonusXp: { type: Number, default: 0 }
      }
    ],

    // Unique per (contentId, subModuleId): enforced by guarded updates
    contentItemProgress: [
      {
        _id: false,
        contentType: { type: String, enum: ['video', 'note', 'mcq'], required: true },
        contentId: { type: ObjectId, refPath: 'contentItemProgress.contentModel', required: true },
        contentModel: { type: String, enum: ['Video', 'Note', 'MCQ'], required: true },
        subModuleId: { type: ObjectId, ref: 'SubModule', required: true },
        completed: { type: Boolean, default: false },
        completedAt: { type: Date },
        pointsEarned: { type: Number, default: 0 },
        xpAwarded: { type: Number, default: 0 },
        watchedDuration: { type: Number },
        watchedIntervals: { type: [[Number]], default: undefined },
        lastPositionSeconds: { type: Number },
        selectedOptions: { type: [Number], default: undefined },
        attempts: { type: Number, default: 0 },
        bestScore: { type: Number, min: 0, max: 1 }
      }
    ],

    lastActivityAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

userProgressSchema.index({ user: 1, course: 1 }, { unique: true });
userProgressSchema.index({ course: 1, overallProgress: -1 });

export const UserProgress = mongoose.model<IUserProgress>('UserProgress', userProgressSchema);
export default UserProgress;
