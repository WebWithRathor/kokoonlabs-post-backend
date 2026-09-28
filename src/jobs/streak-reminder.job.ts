import UserStreak from '../models/user-streak.model';
import LmsRewardsDao from '../dao/lms-rewards.dao';
import { INotification } from '../interfaces/lms-rewards.interface';
import { istDay, shiftDay } from '../utils/ist-date';
import logger from '../config/logger';

const BATCH = 500;

// 8 PM IST: students who were active yesterday but not yet today are about
// to lose their streak. dedupeKey 'streak:<day>' = one reminder per day,
// even if this runs twice or on several servers.
export const runStreakReminder = async (now: Date = new Date()): Promise<number> => {
  const today = istDay(now);
  const yesterday = shiftDay(today, -1);
  const cursor = UserStreak.find({ lastActivityDate: yesterday, currentStreak: { $gt: 0 } })
    .select('user currentStreak')
    .lean()
    .cursor();

  let batch: Partial<INotification>[] = [];
  let total = 0;
  for await (const s of cursor) {
    batch.push({
      user: s.user,
      type: 'streak_reminder',
      title: `Your 🔥 ${s.currentStreak}-day streak ends tonight!`,
      body: 'Finish one lesson before midnight to keep it going.',
      link: '/',
      dedupeKey: `streak:${today}`
    });
    if (batch.length >= BATCH) {
      await LmsRewardsDao.notifyOnce(batch);
      total += batch.length;
      batch = [];
    }
  }
  await LmsRewardsDao.notifyOnce(batch);
  total += batch.length;
  logger.info(`Streak reminder (${today}): ${total} students`);
  return total;
};
