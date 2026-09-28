import mongoose, { Schema } from 'mongoose';
import { INote } from '../interfaces/lms-content.interface';

const noteSchema = new Schema<INote>(
  {
    title: { type: String, required: [true, 'Note title is required'], trim: true },
    content: { type: String, required: [true, 'Content URL is required'], match: [/^https?:\/\/.+/i, 'Content must be a valid URL'] },
    description: { type: String, trim: true, maxLength: [200, 'Description cannot exceed 200 characters'] },
    images: [{ type: String }],
    points: { type: Number, required: [true, 'Points are required'], min: [0, 'Points cannot be negative'], default: 1 },
    tags: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

noteSchema.index({ tags: 1 });

export const Note = mongoose.model<INote>('Note', noteSchema);
export default Note;
