import mongoose, { Schema } from 'mongoose';
import { IChallenge } from '../interfaces/lms-rewards.interface';

// global ("Skill Challenge"): visible when the student's level in `skill` >= requiredLevel
// course ("Bonus Mission"): unlocks when the student completes `unlockAfterSubModule`
const challengeSchema = new Schema<IChallenge>(
  {
    type: { type: String, enum: ['global', 'course'], required: [true, 'Challenge type is required'] },
    title: { type: String, required: [true, 'Challenge title is required'], trim: true },
    description: { type: String, required: [true, 'Challenge description is required'] },
    instructions: { type: String },
    maxXp: { type: Number, required: [true, 'Max XP is required'], min: [0, 'Max XP cannot be negative'] },
    maxResubmissions: { type: Number, default: 3, min: [0, 'Resubmissions cannot be negative'] },
    skill: { type: Schema.Types.ObjectId, ref: 'Skill', default: null },
    requiredLevel: { type: Number, min: [1, 'Required level must be at least 1'], default: null },
    course: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    unlockAfterSubModule: { type: Schema.Types.ObjectId, ref: 'SubModule', default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

challengeSchema.pre('validate', function () {
  const hasGlobal = !!this.skill && !!this.requiredLevel;
  const hasCourse = !!this.course && !!this.unlockAfterSubModule;
  if (this.type === 'global' && (!hasGlobal || this.course || this.unlockAfterSubModule)) {
    throw new Error('Global challenge needs skill + requiredLevel, and no course fields');
  }
  if (this.type === 'course' && (!hasCourse || this.skill || this.requiredLevel)) {
    throw new Error('Course challenge needs course + unlockAfterSubModule, and no skill fields');
  }
});

challengeSchema.index({ type: 1, isActive: 1, skill: 1, requiredLevel: 1 });
challengeSchema.index({ unlockAfterSubModule: 1, isActive: 1 });
challengeSchema.index({ course: 1, isActive: 1 });

export const Challenge = mongoose.model<IChallenge>('Challenge', challengeSchema);
export default Challenge;
