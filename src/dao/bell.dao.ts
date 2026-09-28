import { Types } from 'mongoose';
import Notification from '../models/notification.model';
import Announcement from '../models/announcement.model';
import EnrolledCourseLink from '../models/enrollCourseLink.model';
import { IEnrolledCourseLinkStatus } from '../interfaces/enrolled-course-link.interface';
import { IAnnouncement } from '../interfaces/announcement.interface';

type Id = Types.ObjectId | string;
const oid = (id: Id) => new Types.ObjectId(String(id));

export interface Audience {
  courseIds: Types.ObjectId[];
  batchIds: Types.ObjectId[];
}

export interface BellItem {
  _id: Types.ObjectId;
  kind: 'notification' | 'announcement';
  type: string;
  title: string;
  body?: string;
  link?: string;
  data?: unknown;
  priority?: string;
  attachments?: unknown[];
  isRead: boolean;
  createdAt: Date;
}

// The bell icon: per-student notifications and admin announcements in ONE
// paged feed, newest first ($unionWith, MongoDB 4.4+).
export class BellDao {
  async audienceOf(userId: Id): Promise<Audience> {
    const links = await EnrolledCourseLink.find({ userId, status: IEnrolledCourseLinkStatus.SUCCESS })
      .select('courseId batchId')
      .lean();
    return {
      courseIds: links.map(l => oid(l.courseId as Id)),
      batchIds: links.filter(l => l.batchId).map(l => oid(l.batchId as Id))
    };
  }

  // Active, not expired, and aimed at one of the student's batches, one of
  // their courses (with no batch set), or everyone (neither set)
  announcementFilter(a: Audience, now: Date = new Date()): Record<string, unknown> {
    return {
      isActive: true,
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        {
          $or: [
            { batch: { $in: a.batchIds } },
            { batch: null, course: { $in: a.courseIds } },
            { batch: null, course: null }
          ]
        }
      ]
    };
  }

  async feed(userId: Id, a: Audience, skip: number, limit: number): Promise<BellItem[]> {
    const uid = oid(userId);
    return await Notification.aggregate<BellItem>([
      { $match: { user: uid } },
      {
        $project: {
          kind: { $literal: 'notification' },
          type: 1,
          title: 1,
          body: 1,
          link: 1,
          data: 1,
          isRead: { $ne: [{ $ifNull: ['$readAt', null] }, null] },
          createdAt: 1
        }
      },
      {
        $unionWith: {
          coll: Announcement.collection.name,
          pipeline: [
            { $match: this.announcementFilter(a) },
            {
              $project: {
                kind: { $literal: 'announcement' },
                type: { $literal: 'announcement' },
                title: 1,
                body: '$content',
                priority: 1,
                attachments: 1,
                isRead: { $in: [uid, { $ifNull: ['$readBy', []] }] },
                createdAt: '$date'
              }
            }
          ]
        }
      },
      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);
  }

  async counts(userId: Id, a: Audience): Promise<{ total: number; unread: number }> {
    const uid = oid(userId);
    const annFilter = this.announcementFilter(a);
    const [n, nUnread, ann, annUnread] = await Promise.all([
      Notification.countDocuments({ user: uid }),
      Notification.countDocuments({ user: uid, readAt: null }),
      Announcement.countDocuments(annFilter),
      Announcement.countDocuments({ ...annFilter, readBy: { $ne: uid } })
    ]);
    return { total: n + ann, unread: nUnread + annUnread };
  }

  // Ids may be notifications or announcements; each collection only matches its own
  async markRead(userId: Id, a: Audience, ids: string[] | 'all'): Promise<number> {
    const uid = oid(userId);
    const idFilter = ids === 'all' ? {} : { _id: { $in: ids.map(oid) } };
    const [n, ann] = await Promise.all([
      Notification.updateMany({ user: uid, readAt: null, ...idFilter }, { $set: { readAt: new Date() } }),
      Announcement.updateMany(
        { ...this.announcementFilter(a), readBy: { $ne: uid }, ...idFilter },
        { $addToSet: { readBy: uid } }
      )
    ]);
    return n.modifiedCount + ann.modifiedCount;
  }

  // ---- Admin
  async createAnnouncement(data: Partial<IAnnouncement>) {
    return (await Announcement.create(data)).toObject();
  }
  async listAnnouncements(skip: number, limit: number) {
    const [items, total] = await Promise.all([
      Announcement.find().select('-readBy').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Announcement.countDocuments()
    ]);
    return { items, total };
  }
  async updateAnnouncement(id: Id, data: Partial<IAnnouncement>) {
    return await Announcement.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true })
      .select('-readBy')
      .lean();
  }
}

export default new BellDao();
