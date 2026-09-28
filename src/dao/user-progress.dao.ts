import { Types } from 'mongoose';
import UserProgress from '../models/user-progress.model';
import {
  IContentItemProgress,
  IModuleProgress,
  ISubModuleProgress,
  IUserProgress
} from '../interfaces/lms-progress.interface';

type Id = Types.ObjectId | string;

// Every write here is GUARDED: its filter only matches when the change is
// still needed, so retries and double-clicks never apply anything twice.
// Callers check the returned boolean (true = this call made the change).
export class UserProgressDao {
  async findByUserAndCourse(userId: Id, courseId: Id, select?: string): Promise<IUserProgress | null> {
    const query = UserProgress.findOne({ user: userId, course: courseId });
    if (select) query.select(select);
    return await query.lean<IUserProgress>();
  }

  // Creates the progress document once (first open of the course)
  async createIfMissing(
    userId: Id,
    courseId: Id,
    moduleProgress: IModuleProgress[],
    subModuleProgress: ISubModuleProgress[]
  ): Promise<boolean> {
    const res = await UserProgress.updateOne(
      { user: userId, course: courseId },
      { $setOnInsert: { moduleProgress, subModuleProgress, contentItemProgress: [] } },
      { upsert: true }
    ).catch((e: { code?: number }) => {
      if (e.code === 11000) return null; // a parallel request created it
      throw e;
    });
    return !!res?.upsertedCount;
  }

  // Adds unlocked modules / sub-modules that aren't there yet
  async pushUnlocks(
    userId: Id,
    courseId: Id,
    modules: IModuleProgress[],
    subModules: ISubModuleProgress[]
  ): Promise<boolean> {
    if (!modules.length && !subModules.length) return false;
    const res = await UserProgress.updateOne(
      {
        user: userId,
        course: courseId,
        'moduleProgress.module': { $nin: modules.map(m => m.module) },
        'subModuleProgress.subModule': { $nin: subModules.map(s => s.subModule) }
      },
      { $push: { moduleProgress: { $each: modules }, subModuleProgress: { $each: subModules } } }
    );
    return res.modifiedCount === 1;
  }

  // Adds a content progress entry the first time the item is opened
  async ensureContentEntry(userId: Id, courseId: Id, entry: Partial<IContentItemProgress>): Promise<void> {
    await UserProgress.updateOne(
      {
        user: userId,
        course: courseId,
        contentItemProgress: {
          $not: { $elemMatch: { contentId: entry.contentId, subModuleId: entry.subModuleId } }
        }
      },
      { $push: { contentItemProgress: { attempts: 0, completed: false, ...entry } }, $set: { lastActivityAt: new Date() } }
    );
  }

  async findContentEntry(
    userId: Id,
    courseId: Id,
    contentId: Id,
    subModuleId: Id
  ): Promise<IContentItemProgress | null> {
    const doc = await UserProgress.findOne(
      { user: userId, course: courseId },
      { contentItemProgress: { $elemMatch: { contentId, subModuleId } } }
    ).lean<IUserProgress>();
    return doc?.contentItemProgress?.[0] ?? null;
  }

  async saveVideoProgress(
    userId: Id,
    courseId: Id,
    contentId: Id,
    subModuleId: Id,
    data: { watchedIntervals: [number, number][]; watchedDuration: number; lastPositionSeconds: number }
  ): Promise<void> {
    await UserProgress.updateOne(
      { user: userId, course: courseId },
      {
        $set: {
          'contentItemProgress.$[c].watchedIntervals': data.watchedIntervals,
          'contentItemProgress.$[c].watchedDuration': data.watchedDuration,
          'contentItemProgress.$[c].lastPositionSeconds': data.lastPositionSeconds,
          lastActivityAt: new Date()
        }
      },
      { arrayFilters: [{ 'c.contentId': contentId, 'c.subModuleId': subModuleId }] }
    );
  }

  // Guarded on the attempt count read before scoring, so a double-click
  // can't turn into an extra attempt
  async recordMcqAttempt(
    userId: Id,
    courseId: Id,
    contentId: Id,
    subModuleId: Id,
    expectedAttempts: number,
    selected: number[],
    bestScore: number
  ): Promise<boolean> {
    const res = await UserProgress.updateOne(
      {
        user: userId,
        course: courseId,
        contentItemProgress: {
          $elemMatch: { contentId, subModuleId, attempts: expectedAttempts, completed: false }
        }
      },
      {
        $inc: { 'contentItemProgress.$.attempts': 1 },
        $set: {
          'contentItemProgress.$.selectedOptions': selected,
          'contentItemProgress.$.bestScore': bestScore,
          lastActivityAt: new Date()
        }
      }
    );
    return res.modifiedCount === 1;
  }

  async completeContent(
    userId: Id,
    courseId: Id,
    contentId: Id,
    subModuleId: Id,
    points: number,
    xp: number,
    now: Date
  ): Promise<boolean> {
    const res = await UserProgress.updateOne(
      {
        user: userId,
        course: courseId,
        contentItemProgress: { $elemMatch: { contentId, subModuleId, completed: false } }
      },
      {
        $set: {
          'contentItemProgress.$.completed': true,
          'contentItemProgress.$.completedAt': now,
          'contentItemProgress.$.pointsEarned': points,
          'contentItemProgress.$.xpAwarded': xp,
          lastActivityAt: now
        },
        $inc: { totalPointsEarned: points, xpEarned: xp }
      }
    );
    return res.modifiedCount === 1;
  }

  async completeSubModule(
    userId: Id,
    courseId: Id,
    subModuleId: Id,
    xp: number,
    bonusXp: number,
    now: Date
  ): Promise<boolean> {
    const res = await UserProgress.updateOne(
      {
        user: userId,
        course: courseId,
        subModuleProgress: { $elemMatch: { subModule: subModuleId, completedAt: null } }
      },
      {
        $set: {
          'subModuleProgress.$.completedAt': now,
          'subModuleProgress.$.xpAwarded': xp,
          'subModuleProgress.$.bonusXp': bonusXp
        },
        $inc: { xpEarned: xp, bonusXpEarned: bonusXp }
      }
    );
    return res.modifiedCount === 1;
  }

  async completeModule(userId: Id, courseId: Id, moduleId: Id, xp: number, now: Date): Promise<boolean> {
    const res = await UserProgress.updateOne(
      {
        user: userId,
        course: courseId,
        moduleProgress: { $elemMatch: { module: moduleId, completedAt: null } }
      },
      {
        $set: { 'moduleProgress.$.completedAt': now, 'moduleProgress.$.xpAwarded': xp },
        $inc: { xpEarned: xp }
      }
    );
    return res.modifiedCount === 1;
  }

  async setOverallProgress(userId: Id, courseId: Id, percent: number): Promise<void> {
    await UserProgress.updateOne({ user: userId, course: courseId }, { $set: { overallProgress: percent } });
  }

  async listForUser(userId: Id, select: string): Promise<IUserProgress[]> {
    return await UserProgress.find({ user: userId }).select(select).lean<IUserProgress[]>();
  }

  // Sources for rebuilding a student's XP
  async sumXpForUser(userId: Id): Promise<{ xp: number; earlyFinishes: number }> {
    const [row] = await UserProgress.aggregate<{ xp: number; early: number }>([
      { $match: { user: new Types.ObjectId(String(userId)) } },
      {
        $group: {
          _id: null,
          xp: { $sum: '$xpEarned' },
          early: {
            $sum: {
              $size: {
                $filter: { input: { $ifNull: ['$subModuleProgress', []] }, cond: { $gt: ['$$this.bonusXp', 0] } }
              }
            }
          }
        }
      }
    ]);
    return { xp: row?.xp ?? 0, earlyFinishes: row?.early ?? 0 };
  }
}

export default new UserProgressDao();
