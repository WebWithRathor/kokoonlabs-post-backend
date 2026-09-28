import { Types } from 'mongoose';
import UserProgressDao from '../../../dao/user-progress.dao';
import UserStreakDao from '../../../dao/user-streak.dao';
import UserStatsDao from '../../../dao/user-stats.dao';
import LmsEnrollmentDao from '../../../dao/lms-enrollment.dao';
import LmsRewardsDao from '../../../dao/lms-rewards.dao';
import { COPY, XP, Rank, bonusForDaysEarly, contentXp } from '../../../config/gamification.config';
import { ContentType } from '../../../interfaces/lms-content.interface';
import { IUserProgress } from '../../../interfaces/lms-progress.interface';
import { daysBetween, istDay } from '../../../utils/ist-date';
import {
  buildModuleUnlock,
  getCourseStructure,
  progressPercent
} from './course-structure.service';
import {
  EarnedBadge,
  addXp,
  checkBadges,
  issueCertificates,
  levelChange,
  notifyLevelUp
} from './rewards.service';

// Everything the frontend needs to celebrate after one finished item
export interface Celebration {
  alreadyCompleted: boolean;          // true = nothing new happened (retry / double-click)
  xpGained: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  newRank: Rank | null;
  overallProgress: number;
  subModuleCompleted: { id: string; xp: number; bonusXp: number } | null;
  moduleCompleted: { id: string; title: string; xp: number } | null;
  modulesUnlocked: { id: string; title: string }[];
  courseCompleted: boolean;
  certificates: string[];
  badges: EarnedBadge[];
  bonusMissionsUnlocked: { id: string; title: string }[];
  messages: string[];                 // ready-to-show toasts
}

export interface CompletionInput {
  userId: Types.ObjectId | string;
  userName: string;
  courseId: string;
  courseName: string;
  batchId?: Types.ObjectId | string;
  contentId: Types.ObjectId;
  subModuleId: Types.ObjectId;
  contentType: ContentType;
  points: number;                     // the item's progress points
  mcqBestScore?: number;              // 0..1, MCQs only
}

const same = (a: unknown, b: unknown) => String(a) === String(b);

// Runs after a content item is finished: marks it complete, records the
// streak day, then — when a sub-module or module finishes — gives XP,
// raises skills, unlocks the next module, issues certificates, checks
// badges. Every write is guarded, so calling this twice gives nothing twice.
export const completeContentItem = async (input: CompletionInput, now: Date = new Date()): Promise<Celebration> => {
  const { userId, courseId } = input;
  const celebration: Celebration = {
    alreadyCompleted: false,
    xpGained: 0,
    totalXp: 0,
    level: 0,
    leveledUp: false,
    newRank: null,
    overallProgress: 0,
    subModuleCompleted: null,
    moduleCompleted: null,
    modulesUnlocked: [],
    courseCompleted: false,
    certificates: [],
    badges: [],
    bonusMissionsUnlocked: [],
    messages: []
  };
  let totalXp: number | null = null;
  const award = async (xp: number, earlyFinish = false) => {
    const totals = await addXp(userId, xp, earlyFinish);
    if (totals) totalXp = totals.totalXp;
    celebration.xpGained += xp;
  };

  // ---- A. Mark the item complete (+ its XP) — stops here on a repeat call
  const itemXp = contentXp(input.contentType, input.mcqBestScore);
  const done = await UserProgressDao.completeContent(
    userId, courseId, input.contentId, input.subModuleId, input.points, itemXp, now
  );
  if (!done) {
    celebration.alreadyCompleted = true;
    return celebration;
  }
  await award(itemXp);

  // ---- B. Streak day (IST)
  await UserStreakDao.recordCompletion(userId, now);

  // ---- C. Is the sub-module complete?
  const structure = await getCourseStructure(courseId);
  const progress = (await UserProgressDao.findByUserAndCourse(userId, courseId)) as IUserProgress;
  const done_ = (contentId: unknown, subModuleId: unknown) =>
    progress.contentItemProgress.some(c => c.completed && same(c.contentId, contentId) && same(c.subModuleId, subModuleId));

  const located = structure.subModules.get(String(input.subModuleId));
  const subEntry = progress.subModuleProgress.find(s => same(s.subModule, input.subModuleId));

  if (located && subEntry && !subEntry.completedAt) {
    const { subModule, module } = located;
    const allDone = subModule.contents.every(c => done_(c.contentId, subModule._id));

    if (allDone) {
      // ---- D. Sub-module complete: +20 XP + early bonus, skills, Bonus Missions
      const bonusXp = subEntry.deadlineAt
        ? bonusForDaysEarly(daysBetween(istDay(now), istDay(subEntry.deadlineAt)))
        : 0;
      const subXp = XP.SUB_MODULE_COMPLETE + bonusXp;
      if (await UserProgressDao.completeSubModule(userId, courseId, subModule._id, subXp, bonusXp, now)) {
        subEntry.completedAt = now;
        await award(subXp, bonusXp > 0);
        celebration.subModuleCompleted = { id: String(subModule._id), xp: subXp, bonusXp };
        if (bonusXp > 0) celebration.messages.push(`Finished early! +${bonusXp} XP bonus`);

        for (const s of subModule.skills ?? []) {
          await UserStatsDao.raiseSkill(userId, s.skill, s.level);
        }

        const missions = await LmsRewardsDao.findCourseChallengesUnlockedBy(subModule._id);
        celebration.bonusMissionsUnlocked = missions.map(m => ({ id: String(m._id), title: m.title }));
        await LmsRewardsDao.notifyOnce(
          missions.map(m => ({
            user: new Types.ObjectId(String(userId)),
            type: 'challenge_unlocked' as const,
            title: `New Bonus Mission unlocked: ${m.title}`,
            data: { challengeId: String(m._id) },
            link: `/challenges/${m._id}`,
            dedupeKey: `challenge_unlocked:${m._id}`
          }))
        );

        // ---- E. Is the module complete? (a sub-module with no content counts as done)
        const moduleEntry = progress.moduleProgress.find(m => same(m.module, module._id));
        const moduleDone = module.subModules.every(s => {
          const entry = progress.subModuleProgress.find(p => same(p.subModule, s._id));
          return s.contents.length === 0 || !!entry?.completedAt;
        });

        if (moduleEntry && !moduleEntry.completedAt && moduleDone) {
          if (await UserProgressDao.completeModule(userId, courseId, module._id, XP.MODULE_COMPLETE, now)) {
            moduleEntry.completedAt = now;
            await award(XP.MODULE_COMPLETE);
            celebration.moduleCompleted = { id: String(module._id), title: module.title, xp: XP.MODULE_COMPLETE };
            celebration.messages.push(COPY.moduleComplete(module.title, XP.MODULE_COMPLETE));

            // ---- F. Unlock the next module, with all its sub-modules
            const unlocked = new Set(progress.moduleProgress.map(m => String(m.module)));
            const next = structure.modules.find(m => !unlocked.has(String(m._id)));
            if (next) {
              const haveSubs = new Set(progress.subModuleProgress.map(s => String(s.subModule)));
              const { moduleEntry: nextEntry, subModuleEntries } = buildModuleUnlock(next, now, haveSubs);
              if (await UserProgressDao.pushUnlocks(userId, courseId, [nextEntry], subModuleEntries)) {
                celebration.modulesUnlocked.push({ id: String(next._id), title: next.title });
              }
            }

            // ---- G. Course complete?
            const allModulesDone = structure.modules.every(m =>
              progress.moduleProgress.some(p => same(p.module, m._id) && p.completedAt)
            );
            if (allModulesDone) {
              await LmsEnrollmentDao.markCompleted(userId, courseId, now);
              celebration.courseCompleted = true;
            }
          }
        }
      }
    }
  }

  // ---- H. Progress %
  const pointsEarned = progress.totalPointsEarned; // already includes this item
  celebration.overallProgress = progressPercent(pointsEarned, structure.totalPoints);
  await UserProgressDao.setOverallProgress(userId, courseId, celebration.overallProgress);

  // ---- I. Certificates (only when the course is 100% complete)
  const extraBadgeValues: Record<string, number> = {};
  if (celebration.courseCompleted) {
    celebration.certificates = await issueCertificates({
      userId,
      courseId,
      batchId: input.batchId,
      userName: input.userName,
      courseName: input.courseName,
      courseCompleted: true,
      bonusXpEarned: progress.bonusXpEarned + (celebration.subModuleCompleted?.bonusXp ?? 0),
      courseMaxBonusXp: structure.maxBonusXp
    });
    celebration.certificates.forEach(name => celebration.messages.push(COPY.certificateEarned(name)));
    extraBadgeValues.courses_completed = await LmsRewardsDao.countCompletionCertificates(userId);
  }

  // ---- J. Badges (streak and XP badges can land on any item)
  celebration.badges = await checkBadges(userId, extraBadgeValues);
  celebration.badges.forEach(b => celebration.messages.push(COPY.badgeEarned(b.name)));

  // ---- K. Level-up
  if (totalXp !== null) {
    const change = levelChange(totalXp, celebration.xpGained);
    Object.assign(celebration, { totalXp, ...change });
    if (change.leveledUp) {
      celebration.messages.unshift(change.newRank ? COPY.rankUp(change.newRank) : COPY.levelUp(change.level));
      await notifyLevelUp(userId, change);
    }
  }

  return celebration;
};
