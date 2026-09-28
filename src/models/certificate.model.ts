import mongoose, { Schema } from 'mongoose';
import { ICertificate } from '../interfaces/lms-rewards.interface';

// progress   = "Certificate of Completion": course 100% complete
// excellence = course complete AND bonus XP >= 50% of the course's max bonus XP
const certificateSchema = new Schema<ICertificate>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'User reference is required'] },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: [true, 'Course reference is required'] },
    batch: { type: Schema.Types.ObjectId, ref: 'Batch' },
    type: { type: String, enum: ['progress', 'excellence'], required: [true, 'Certificate type is required'] },
    certificateId: { type: String, required: [true, 'Certificate ID is required'], unique: true },
    issueDate: { type: Date, default: Date.now },
    progress: { type: Number, required: [true, 'Progress percentage is required'] },
    xpPercent: { type: Number, default: null },
    fileUrl: { type: String },
    // Snapshot at issue time
    metadata: {
      _id: false,
      userName: { type: String, required: true },
      courseName: { type: String, required: true },
      batchName: { type: String },
      instructorName: { type: String }
    }
  },
  { timestamps: true }
);

certificateSchema.index({ user: 1, course: 1, type: 1 }, { unique: true });

export const Certificate = mongoose.model<ICertificate>('Certificate', certificateSchema);
export default Certificate;
