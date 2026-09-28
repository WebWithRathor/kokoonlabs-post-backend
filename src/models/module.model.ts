import mongoose, { Schema } from 'mongoose';
import { IModule } from '../interfaces/lms-content.interface';

const moduleSchema = new Schema<IModule>(
  {
    title: { type: String, required: [true, 'Module title is required'], trim: true },
    description: { type: String, required: [true, 'Module description is required'] },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: [true, 'Course reference is required'] },
    // Unlock order: first 3 active modules open, each completion opens the next.
    // Use gapped values (1000, 2000...) so reordering is one update.
    order: { type: Number, required: [true, 'Module order is required'] },
    isActive: { type: Boolean, default: true },
    totalPoints: { type: Number, default: 0 },
    maxBonusXp: { type: Number, default: 0 }
  },
  { timestamps: true }
);

moduleSchema.index({ course: 1, isActive: 1, order: 1 });

export const Module = mongoose.model<IModule>('Module', moduleSchema);
export default Module;
