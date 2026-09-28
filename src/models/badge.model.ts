import mongoose, { Schema } from 'mongoose';
import { IBadge } from '../interfaces/lms-rewards.interface';

// Badge = rule + threshold. New badges are new documents, no code change.
//   total_xp              UserStats.totalXp             >= threshold
//   streak_days           UserStreak.longestStreak      >= threshold
//   projects_approved     approved submissions          >= threshold
//   courses_completed     Completion certificates       >= threshold
//   challenges_completed  distinct challenges approved  >= threshold
//   early_finishes        UserStats.earlyFinishes       >= threshold
const badgeSchema = new Schema<IBadge>(
  {
    name: { type: String, required: [true, 'Badge name is required'], trim: true },
    description: { type: String, trim: true },
    icon: { type: String, required: [true, 'Badge icon is required'] },
    ruleType: {
      type: String,
      enum: ['total_xp', 'streak_days', 'projects_approved', 'courses_completed', 'challenges_completed', 'early_finishes'],
      required: [true, 'Rule type is required']
    },
    threshold: { type: Number, required: [true, 'Threshold is required'], min: [1, 'Threshold must be at least 1'] },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

badgeSchema.index({ ruleType: 1, threshold: 1 }, { unique: true });
badgeSchema.index({ isActive: 1, ruleType: 1, threshold: 1 });

export const Badge = mongoose.model<IBadge>('Badge', badgeSchema);
export default Badge;
