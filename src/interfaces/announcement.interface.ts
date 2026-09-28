import { Document, Types } from 'mongoose';

export type AnnouncementPriority = 'low' | 'medium' | 'high';

export interface IAnnouncementAttachment {
  name: string;
  url: string;
  type: string;
}

// Admin broadcast. Audience: a batch, a course, or everyone (neither set).
export interface IAnnouncement extends Document {
  title: string;
  content: string;
  author?: Types.ObjectId;
  authorName?: string;
  course?: Types.ObjectId | null;
  batch?: Types.ObjectId | null;
  priority: AnnouncementPriority;
  attachments: IAnnouncementAttachment[];
  date: Date;
  isActive: boolean;
  expiresAt?: Date | null;
  readBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}
