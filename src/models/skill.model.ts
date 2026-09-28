import mongoose, { Schema } from 'mongoose';
import { ISkill } from '../interfaces/lms-rewards.interface';

const skillSchema = new Schema<ISkill>(
  {
    name: { type: String, required: [true, 'Skill name is required'], trim: true },
    slug: {
      type: String,
      required: [true, 'Skill slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug can only contain lowercase letters, numbers and hyphens']
    },
    description: { type: String, trim: true },
    icon: { type: String },
    // Deactivate instead of deleting: sub-modules and student levels reference it
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Skill = mongoose.model<ISkill>('Skill', skillSchema);
export default Skill;
