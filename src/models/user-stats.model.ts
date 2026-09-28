import mongoose, { Schema } from 'mongoose';
import { IUserStats } from '../interfaces/lms-progress.interface';

// Lifetime stats, one per student, created on the first XP award (upsert).
// This is the single source of XP; don't use User.xp for the LMS.
const userStatsSchema = new Schema<IUserStats>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'User reference is required'] },
    totalXp: { type: Number, default: 0, min: [0, 'XP cannot be negative'] },
    level: { type: Number, default: 0 },
    earlyFinishes: { type: Number, default: 0 },
    skills: [
      {
        _id: false,
        skill: { type: Schema.Types.ObjectId, ref: 'Skill', required: true },
        level: { type: Number, required: true, min: 1 }
      }
    ],
    badges: [
      {
        _id: false,
        badge: { type: Schema.Types.ObjectId, ref: 'Badge', required: true },
        awardedAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

userStatsSchema.index({ user: 1 }, { unique: true });
userStatsSchema.index({ totalXp: -1 });
userStatsSchema.index({ 'skills.skill': 1, 'skills.level': 1 });

export const UserStats = mongoose.model<IUserStats>('UserStats', userStatsSchema);
export default UserStats;
