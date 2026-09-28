import { Types } from 'mongoose';
import crypto from 'crypto';
import UserStatsDao from '../../../dao/user-stats.dao';
import UserStreakDao from '../../../dao/user-streak.dao';
import UserProgressDao from '../../../dao/user-progress.dao';
import LmsRewardsDao from '../../../dao/lms-rewards.dao';
import { COPY, NAMES, Rank, levelFromXp, rankForLevel } from '../../../config/gamification.config';
import { BadgeRuleType, CertificateType } from '../../../interfaces/lms-rewards.interface';

type Id = Types.ObjectId | string;

// ---------------------------------------------------------------------
// XP
// ---------------------------------------------------------------------
export interface XpTotals {
  totalXp: number;
  level: number;
}

export const addXp = async (userId: Id, xp: number, earlyFinish = false): Promise<XpTotals | null> => {
  if (xp <= 0 && !earlyFinish) return null;
  return await UserStatsDao.addXp(userId, xp, earlyFinish);
};

export interface LevelChange {
  level: number;
  leveledUp: boolean;
  newRank: Rank | null;
}

// Compares the level before and after a run of XP awards
export const levelChange = (finalTotalXp: number, xpGained: number): LevelChange => {
  const level = levelFromXp(finalTotalXp);
  const before = levelFromXp(finalTotalXp - xpGained);
  const rankBefore = rankForLevel(before);
  const rankAfter = rankForLevel(level);
  return { level, leveledUp: level > before, newRank: rankAfter.key !== rankBefore.key ? rankAfter : null };
};

// In-app only; once per level
export const notifyLevelUp = async (userId: Id, change: LevelChange): Promise<void> => {
  if (!change.leveledUp) return;
  await LmsRewardsDao.notifyOnce([
    {
      user: new Types.ObjectId(String(userId)),
      type: 'level_up',
      title: change.newRank ? COPY.rankUp(change.newRank) : COPY.levelUp(change.level),
      body: change.newRank ? COPY.levelUp(change.level) : undefined,
      data: { level: change.level, rank: change.newRank?.key },
      link: '/profile',
      dedupeKey: `level:${change.level}`
    }
  ]);
};

// ---------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------
export interface EarnedBadge {
  id: string;
  name: string;
  icon: string;
  description?: string;
}

// Checks the rules whose values we know right now, awards new badges once,
// and notifies. `extra` lets callers pass counts they already have.
export const checkBadges = async (
  userId: Id,
  extra: Partial<Record<BadgeRuleType, number>> = {}
): Promise<EarnedBadge[]> => {
  const [stats, streak] = await Promise.all([
    UserStatsDao.findByUser(userId, 'totalXp earlyFinishes badges'),
    UserStreakDao.findByUser(userId, 'longestStreak')
  ]);
  const owned = (stats?.badges ?? []).map(b => b.badge);
  const values: Partial<Record<BadgeRuleType, number>> = {
    total_xp: stats?.totalXp ?? 0,
    early_finishes: stats?.earlyFinishes ?? 0,
    streak_days: streak?.longestStreak ?? 0,
    ...extra
  };

  const candidates = await LmsRewardsDao.findEarnableBadges(owned, values);
  const earned: EarnedBadge[] = [];
  for (const badge of candidates) {
    if (await UserStatsDao.awardBadge(userId, badge._id as Types.ObjectId)) {
      earned.push({ id: String(badge._id), name: badge.name, icon: badge.icon, description: badge.description });
    }
  }

  await LmsRewardsDao.notifyOnce(
    earned.map(b => ({
      user: new Types.ObjectId(String(userId)),
      type: 'badge_earned' as const,
      title: COPY.badgeEarned(b.name),
      body: b.description,
      data: { badgeId: b.id },
      link: '/profile',
      dedupeKey: `badge:${b.id}`
    }))
  );
  return earned;
};

// ---------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------
export const EXCELLENCE_XP_MIN = 50; // % of the course's max bonus XP

export const eligibleCertificates = (
  courseCompleted: boolean,
  bonusXpEarned: number,
  courseMaxBonusXp: number
): { types: CertificateType[]; xpPercent: number | null } => {
  const xpPercent = courseMaxBonusXp > 0 ? Math.round((bonusXpEarned / courseMaxBonusXp) * 100) : null;
  const types: CertificateType[] = [];
  if (courseCompleted) {
    types.push('progress');
    if (xpPercent !== null && xpPercent >= EXCELLENCE_XP_MIN) types.push('excellence');
  }
  return { types, xpPercent };
};

const newCertificateId = (): string =>
  `KL-${new Date().getFullYear()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

// Issues any certificate the student now qualifies for and doesn't have yet.
// Returns the names of the newly issued ones.
export const issueCertificates = async (p: {
  userId: Id;
  courseId: Id;
  batchId?: Id;
  userName: string;
  courseName: string;
  courseCompleted: boolean;
  bonusXpEarned: number;
  courseMaxBonusXp: number;
}): Promise<string[]> => {
  const { types, xpPercent } = eligibleCertificates(p.courseCompleted, p.bonusXpEarned, p.courseMaxBonusXp);
  if (!types.length) return [];
  const have = new Set(await LmsRewardsDao.findCertificateTypes(p.userId, p.courseId));
  const issued: string[] = [];
  for (const type of types.filter(t => !have.has(t))) {
    const cert = await LmsRewardsDao.createCertificate({
      user: new Types.ObjectId(String(p.userId)),
      course: new Types.ObjectId(String(p.courseId)),
      batch: p.batchId ? new Types.ObjectId(String(p.batchId)) : undefined,
      type,
      certificateId: newCertificateId(),
      progress: 100,
      xpPercent,
      metadata: { userName: p.userName, courseName: p.courseName }
    });
    if (cert) issued.push(NAMES.certificate[type]);
  }
  return issued;
};

// ---------------------------------------------------------------------
// Repair: rebuild a student's XP from the sources of truth
// ---------------------------------------------------------------------
export const rebuildUserXp = async (userId: Id): Promise<number> => {
  const [course, challengeXp] = await Promise.all([
    UserProgressDao.sumXpForUser(userId),
    LmsRewardsDao.sumApprovedXp(userId)
  ]);
  const totalXp = course.xp + challengeXp;
  await UserStatsDao.setTotals(userId, totalXp, course.earlyFinishes);
  return totalXp;
};
