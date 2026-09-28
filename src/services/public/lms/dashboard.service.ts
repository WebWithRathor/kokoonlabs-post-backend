import { Types } from 'mongoose';
import LmsDashboardDao from '../../../dao/lms-dashboard.dao';
import BellDao from '../../../dao/bell.dao';
import UserProgressDao from '../../../dao/user-progress.dao';
import UserStreakDao from '../../../dao/user-streak.dao';
import { NAMES, levelCard } from '../../../config/gamification.config';
import { IUserSkillLevel } from '../../../interfaces/lms-progress.interface';
import { istDay, shiftDay } from '../../../utils/ist-date';
import { pagination } from '../../../interfaces/common.interface';
import { downloadPathFor } from '../certificate.service';

type Id = Types.ObjectId | string;

const HEATMAP_DAYS = 365;

// Streak to show: 0 once a day has been missed (the stored number only
// resets on the next completion)
const displayStreak = (currentStreak: number, lastActivityDate: string | null, now: Date): number => {
  if (!lastActivityDate) return 0;
  const today = istDay(now);
  return lastActivityDate === today || lastActivityDate === shiftDay(today, -1) ? currentStreak : 0;
};

const streakCard = async (userId: Id, now: Date) => {
  const streak = await UserStreakDao.findByUser(userId, 'currentStreak longestStreak lastActivityDate');
  const current = displayStreak(streak?.currentStreak ?? 0, streak?.lastActivityDate ?? null, now);
  return {
    current,
    longest: streak?.longestStreak ?? 0,
    activeToday: streak?.lastActivityDate === istDay(now)
  };
};

// ---------------------------------------------------------------------
// Home: enrolled courses, XP / level / streak, showcase, challenges
// ---------------------------------------------------------------------
export const getHome = async (userId: Id, now: Date = new Date()) => {
  const [enrollments, progressDocs, stats, streak, showcase, approvedIds] = await Promise.all([
    LmsDashboardDao.listActiveEnrollments(userId),
    UserProgressDao.listForUser(
      userId,
      'course overallProgress xpEarned lastActivityAt subModuleProgress.subModule subModuleProgress.completedAt'
    ),
    LmsDashboardDao.findStatsWithRefs(userId),
    streakCard(userId, now),
    LmsDashboardDao.listApprovedSubmissions(userId, 6),
    LmsDashboardDao.listApprovedChallengeIds(userId)
  ]);

  const progressByCourse = new Map(progressDocs.map(p => [String(p.course), p]));
  const courses = enrollments.map(e => {
    const p = progressByCourse.get(String(e.courseId));
    return {
      courseId: String(e.courseId),
      title: e.courseTitle,
      thumbnail: e.courseThumbnail,
      started: !!p,
      progress: p?.overallProgress ?? 0,
      xpEarned: p?.xpEarned ?? 0,
      completed: !!e.completedAt,
      continue: e.lastViewedContent ?? null
    };
  });

  const completedSubModules = progressDocs.flatMap(p =>
    p.subModuleProgress.filter(s => s.completedAt).map(s => s.subModule)
  );
  const skills = ((stats?.skills ?? []) as unknown as { skill: { _id: Types.ObjectId } | null; level: number }[])
    .filter(s => s.skill)
    .map(s => ({ skill: s.skill!._id, level: s.level })) as IUserSkillLevel[];
  const challenges = await LmsDashboardDao.listAvailableChallenges(skills, completedSubModules, approvedIds, 6);

  return {
    stats: { ...levelCard(stats?.totalXp ?? 0), streak },
    courses,
    showcase: {
      title: NAMES.projects,
      items: showcase
    },
    challenges: challenges.map(c => ({
      id: String(c._id),
      kind: c.type === 'global' ? NAMES.globalChallenge : NAMES.courseChallenge,
      type: c.type,
      title: c.title,
      description: c.description,
      maxXp: c.maxXp,
      skill: c.skill,
      requiredLevel: c.requiredLevel,
      courseId: c.course ? String(c.course) : null
    }))
  };
};

// ---------------------------------------------------------------------
// Profile: level card, skills, badges, certificates, streak + heatmap
// ---------------------------------------------------------------------
export const getProfile = async (userId: Id, now: Date = new Date()) => {
  const [stats, streakDoc, certificates, projectCount] = await Promise.all([
    LmsDashboardDao.findStatsWithRefs(userId),
    UserStreakDao.findByUser(userId),
    LmsDashboardDao.listCertificates(userId),
    LmsDashboardDao.listApprovedChallengeIds(userId)
  ]);

  // Heatmap: one entry per active IST day in the last year; days not
  // listed are 0 (the frontend fills the grid)
  const from = shiftDay(istDay(now), -(HEATMAP_DAYS - 1));
  const heatmap = (streakDoc?.streakHistory ?? [])
    .filter(d => d.date >= from)
    .map(d => ({ date: d.date, count: d.itemsCompleted }));

  return {
    stats: {
      ...levelCard(stats?.totalXp ?? 0),
      earlyFinishes: stats?.earlyFinishes ?? 0,
      challengesCompleted: projectCount.length
    },
    skills: (stats?.skills ?? []).map(s => ({ skill: s.skill, level: s.level })),
    badges: (stats?.badges ?? [])
      .map(b => ({ badge: b.badge, awardedAt: b.awardedAt }))
      .sort((a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime()),
    certificates: certificates.map(c => ({
      id: String(c._id),
      courseId: String(c.course),
      courseName: c.metadata?.courseName,
      name: NAMES.certificate[c.type],
      type: c.type,
      certificateId: c.certificateId,
      issueDate: c.issueDate,
      downloadUrl: downloadPathFor(c.certificateId)
    })),
    streak: {
      current: displayStreak(streakDoc?.currentStreak ?? 0, streakDoc?.lastActivityDate ?? null, now),
      longest: streakDoc?.longestStreak ?? 0,
      heatmap: { from, to: istDay(now), days: heatmap }
    }
  };
};

// ---------------------------------------------------------------------
// Bell icon: notifications + announcements in one paged feed
// ---------------------------------------------------------------------
export const listNotifications = async (
  userId: Id,
  page: { page: number; limit: number; skip: number }
): Promise<{ notifications: unknown[]; unread: number; pagination: pagination }> => {
  const audience = await BellDao.audienceOf(userId);
  const [items, counts] = await Promise.all([
    BellDao.feed(userId, audience, page.skip, page.limit),
    BellDao.counts(userId, audience)
  ]);
  return {
    notifications: items,
    unread: counts.unread,
    pagination: {
      currentPage: page.page,
      total: counts.total,
      limit: page.limit,
      totalPages: Math.ceil(counts.total / page.limit)
    }
  };
};

// ids can be notification or announcement ids (the feed's _id values)
export const markNotificationsRead = async (userId: Id, ids: string[] | 'all'): Promise<{ marked: number }> => {
  const audience = await BellDao.audienceOf(userId);
  return { marked: await BellDao.markRead(userId, audience, ids) };
};
