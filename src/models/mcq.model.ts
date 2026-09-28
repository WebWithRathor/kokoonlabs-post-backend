import mongoose, { Schema } from 'mongoose';
import { IMCQ } from '../interfaces/lms-content.interface';

// NEVER send options[].isCorrect or explanation to a student before the
// question is done (fully correct or attempts used up).
const mcqSchema = new Schema<IMCQ>(
  {
    title: { type: String, required: [true, 'MCQ title is required'], trim: true },
    question: { type: String, required: [true, 'Question is required'] },
    image: { type: String },
    codeSnippets: [{ _id: false, language: { type: String, required: true }, code: { type: String, required: true } }],
    // Answers are stored as option indexes: don't reorder options once attempted
    options: [{ _id: false, text: { type: String, required: true }, isCorrect: { type: Boolean, required: true } }],
    selectionType: { type: String, enum: ['single', 'multiple'], required: true, default: 'single' },
    maxAttempts: { type: Number, default: 3, min: [1, 'At least 1 attempt is required'] },
    points: { type: Number, required: [true, 'Points are required'], min: [0, 'Points cannot be negative'], default: 1 },
    explanation: { text: String, video: String, image: String },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: [true, 'Difficulty level is required'] },
    tags: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

mcqSchema.pre('validate', function () {
  const options = this.options || [];
  const correct = options.filter(o => o.isCorrect).length;
  if (options.length < 2) throw new Error('MCQ needs at least 2 options');
  if (this.selectionType === 'single' && correct !== 1) throw new Error('Single-select MCQ must have exactly 1 correct option');
  if (this.selectionType === 'multiple' && correct < 1) throw new Error('Multiple-select MCQ must have at least 1 correct option');
});

mcqSchema.index({ difficulty: 1 });
mcqSchema.index({ tags: 1 });

export const MCQ = mongoose.model<IMCQ>('MCQ', mcqSchema);
export default MCQ;
