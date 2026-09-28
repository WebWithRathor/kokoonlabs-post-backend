import mongoose, { Schema } from 'mongoose';
import { IUserStreak } from '../interfaces/lms-progress.interface';

// Days are IST calendar days ('YYYY-MM-DD'). A day counts when the student
// completes at least one content item.
const userStreakSchema = new Schema<IUserStreak>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'User reference is required'] },
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastActivityDate: { type: String, default: null, match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'] },
    // Heatmap source: one small entry per active day
    streakHistory: [{ _id: false, date: { type: String, required: true }, itemsCompleted: { type: Number, default: 0 } }]
  },
  { timestamps: true }
);

userStreakSchema.index({ user: 1 }, { unique: true });
userStreakSchema.index({ lastActivityDate: 1, currentStreak: 1 }); // 8 PM reminder job

export const UserStreak = mongoose.model<IUserStreak>('UserStreak', userStreakSchema);
export default UserStreak;
