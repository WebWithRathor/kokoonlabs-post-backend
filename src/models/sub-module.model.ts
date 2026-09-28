import mongoose, { Schema } from 'mongoose';
import { ISubModule, ISubModuleModel } from '../interfaces/lms-content.interface';
import { maxBonusForDeadline } from '../config/gamification.config';

const subModuleSchema = new Schema<ISubModule, ISubModuleModel>(
  {
    title: { type: String, required: [true, 'SubModule title is required'], trim: true },
    description: { type: String, required: [true, 'SubModule description is required'] },
    module: { type: Schema.Types.ObjectId, ref: 'Module', required: [true, 'Module reference is required'] },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: [true, 'Course reference is required'] },
    // Display order only: all active sub-modules unlock with their module
    order: { type: Number, required: [true, 'SubModule order is required'] },
    points: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    // Days from the MODULE's unlock (set running totals, e.g. 4, 8, 12)
    deadlineDays: { type: Number, min: [1, 'Deadline must be at least 1 day'], default: null },
    // Derived from deadlineDays on save; set with maxBonusForDeadline() on findOneAndUpdate
    maxBonusXp: { type: Number, default: 0 },
    skills: [
      {
        _id: false,
        skill: { type: Schema.Types.ObjectId, ref: 'Skill', required: true },
        level: { type: Number, required: true, min: [1, 'Skill level must be at least 1'] }
      }
    ]
  },
  { timestamps: true }
);

subModuleSchema.pre('save', function () {
  if (this.isNew || this.isModified('deadlineDays')) {
    this.maxBonusXp = maxBonusForDeadline(this.deadlineDays);
  }
});

subModuleSchema.index({ module: 1, isActive: 1, order: 1 });
subModuleSchema.index({ course: 1 });
subModuleSchema.index({ 'skills.skill': 1 });

export const SubModule = mongoose.model<ISubModule, ISubModuleModel>('SubModule', subModuleSchema);
export default SubModule;
