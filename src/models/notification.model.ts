import mongoose, { Schema } from 'mongoose';
import { INotification, NotificationType } from '../interfaces/lms-rewards.interface';

// Celebrations stay in the bell icon; no email for these
export const IN_APP_ONLY: NotificationType[] = ['level_up', 'badge_earned'];

const notificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: [true, 'User reference is required'] },
    type: {
      type: String,
      enum: ['streak_reminder', 'challenge_unlocked', 'new_global_challenge', 'project_reviewed', 'level_up', 'badge_earned'],
      required: [true, 'Notification type is required']
    },
    title: { type: String, required: [true, 'Notification title is required'], trim: true },
    body: { type: String },
    link: { type: String },
    data: { type: Schema.Types.Mixed },
    // e.g. 'streak:2026-09-24', 'level:5', 'badge:<id>' — each event notifies once
    dedupeKey: { type: String },
    readAt: { type: Date, default: null },
    emailStatus: {
      type: String,
      enum: ['pending', 'sending', 'sent', 'failed', 'skipped'],
      default: function (this: INotification) {
        return IN_APP_ONLY.includes(this.type) ? 'skipped' : 'pending';
      }
    },
    emailSentAt: { type: Date },
    emailClaimedAt: { type: Date }, // set while a worker is sending it
    emailError: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index(
  { user: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
notificationSchema.index({ emailStatus: 1, createdAt: 1 }, { partialFilterExpression: { emailStatus: 'pending' } });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
export default Notification;
