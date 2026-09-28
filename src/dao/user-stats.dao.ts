import { Types } from 'mongoose';
import UserStats from '../models/user-stats.model';
import { IUserStats } from '../interfaces/lms-progress.interface';
import { levelFromXp } from '../config/gamification.config';

type Id = Types.ObjectId | string;

export class UserStatsDao {
  async findByUser(userId: Id, select?: string): Promise<IUserStats | null> {
    const query = UserStats.findOne({ user: userId });
    if (select) query.select(select);
    return await query.lean<IUserStats>();
  }

  // Adds XP and recomputes the level in ONE atomic write. Upserts, so the
  // stats document is created on the student's first XP.
  async addXp(userId: Id, xp: number, earlyFinish = false): Promise<{ totalXp: number; level: number } | null> {
    return await UserStats.findOneAndUpdate(
      { user: userId },
      [
        {
          $set: {
            totalXp: { $add: [{ $ifNull: ['$totalXp', 0] }, xp] },
            earlyFinishes: { $add: [{ $ifNull: ['$earlyFinishes', 0] }, earlyFinish ? 1 : 0] },
            skills: { $ifNull: ['$skills', []] },
            badges: { $ifNull: ['$badges', []] }
          }
        },
        {
          $set: {
            // level n needs 25n^2 + 75n XP  =>  n = floor((-75 + sqrt(5625 + 100 xp)) / 50)
            level: {
              $floor: {
                $divide: [{ $add: [-75, { $sqrt: { $add: [5625, { $multiply: [100, '$totalXp'] }] } }] }, 50]
              }
            }
          }
        }
      ],
      { new: true, upsert: true, updatePipeline: true, projection: { totalXp: 1, level: 1 } }
    ).lean<{ totalXp: number; level: number }>();
  }

  // Raises a skill level; never lowers it
  async raiseSkill(userId: Id, skillId: Id, level: number): Promise<void> {
    const raised = await UserStats.updateOne(
      { user: userId, skills: { $elemMatch: { skill: skillId, level: { $lt: level } } } },
      { $set: { 'skills.$.level': level } }
    );
    if (raised.matchedCount) return;
    await UserStats.updateOne(
      { user: userId, 'skills.skill': { $ne: skillId } },
      { $push: { skills: { skill: skillId, level } } },
      { upsert: true }
    ).catch((e: { code?: number }) => {
      if (e.code !== 11000) throw e; // skill already present: nothing to add
    });
  }

  // true = newly earned
  async awardBadge(userId: Id, badgeId: Id): Promise<boolean> {
    const res = await UserStats.updateOne(
      { user: userId, 'badges.badge': { $ne: badgeId } },
      { $push: { badges: { badge: badgeId, awardedAt: new Date() } } }
    );
    return res.modifiedCount === 1;
  }

  async setTotals(userId: Id, totalXp: number, earlyFinishes: number): Promise<void> {
    await UserStats.updateOne(
      { user: userId },
      { $set: { totalXp, level: levelFromXp(totalXp), earlyFinishes } },
      { upsert: true }
    );
  }
}

export default new UserStatsDao();
