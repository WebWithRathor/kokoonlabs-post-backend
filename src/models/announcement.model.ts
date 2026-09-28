import mongoose, { Schema } from 'mongoose';
import { IAnnouncement } from '../interfaces/announcement.interface';

// Admin broadcast, shown in the bell icon next to per-student notifications.
// Audience: `batch` if set, else `course` if set, else every student.
const announcementSchema = new Schema<IAnnouncement>(
  {
    title: { type: String, required: [true, 'Announcement title is required'], trim: true, maxlength: 200 },
    content: { type: String, required: [true, 'Announcement content is required'], maxlength: 5000 },
    author: { type: Schema.Types.ObjectId, ref: 'User' },
    authorName: { type: String },
    course: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    batch: { type: Schema.Types.ObjectId, ref: 'Batch', default: null },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    attachments: [
      {
        _id: false,
        name: { type: String, required: true },
        url: { type: String, required: true, match: [/^https?:\/\/.+/i, 'Attachment URL must be a valid URL'] },
        type: { type: String, required: true }
      }
    ],
    date: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
    // Who has read it. Fine for a few thousand readers per announcement; move
    // reads to their own collection if audiences grow into the tens of thousands.
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }]
  },
  { timestamps: true }
);

announcementSchema.index({ isActive: 1, batch: 1, createdAt: -1 });
announcementSchema.index({ isActive: 1, course: 1, createdAt: -1 });

export const Announcement = mongoose.model<IAnnouncement>('Announcement', announcementSchema);
export default Announcement;
