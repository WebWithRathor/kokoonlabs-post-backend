import { Types } from 'mongoose';
import UserStreak from '../models/user-streak.model';
import { IUserStreak } from '../interfaces/lms-progress.interface';
import { istDay, shiftDay } from '../utils/ist-date';

type Id = Types.ObjectId | string;

export class UserStreakDao {
  async findByUser(userId: Id, select?: string): Promise<IUserStreak | null> {
    const query = UserStreak.findOne({ user: userId });
    if (select) query.select(select);
    return await query.lean<IUserStreak>();
  }

  // Call once per content completion. Safe under parallel requests.
  async recordCompletion(userId: Id, now: Date = new Date()): Promise<void> {
    const today = istDay(now);
    const yesterday = shiftDay(today, -1);

    // 1) Already active today: bump the counter
    const bumped = await UserStreak.updateOne(
      { user: userId, 'streakHistory.date': today },
      { $inc: { 'streakHistory.$.itemsCompleted': 1 } }
    );
    if (bumped.matchedCount) return;

    // 2) First completion today: add the day and update the streak in one
    //    write; the $ne filter stops a parallel request adding the day twice
    const first = await UserStreak.updateOne(
      { user: userId, 'streakHistory.date': { $ne: today } },
      [
        {
          $set: {
            currentStreak: {
              $cond: [{ $eq: ['$lastActivityDate', yesterday] }, { $add: ['$currentStreak', 1] }, 1]
            },
            lastActivityDate: today,
            streakHistory: {
              $concatArrays: [{ $ifNull: ['$streakHistory', []] }, [{ date: today, itemsCompleted: 1 }]]
            }
          }
        },
        { $set: { longestStreak: { $max: ['$longestStreak', '$currentStreak'] } } }
      ],
      { updatePipeline: true }
    );
    if (first.matchedCount) return;

    // 3) No streak document yet: create it (or bump if a parallel call just did)
    const created = await UserStreak.updateOne(
      { user: userId },
      {
        $setOnInsert: {
          currentStreak: 1,
          longestStreak: 1,
          lastActivityDate: today,
          streakHistory: [{ date: today, itemsCompleted: 1 }]
        }
      },
      { upsert: true }
    ).catch((e: { code?: number }) => {
      if (e.code === 11000) return null;
      throw e;
    });
    if (!created?.upsertedCount) {
      await UserStreak.updateOne(
        { user: userId, 'streakHistory.date': today },
        { $inc: { 'streakHistory.$.itemsCompleted': 1 } }
      );
    }
  }
}

export default new UserStreakDao();
