import { Types } from 'mongoose';
import UserProgressDao from '../../../dao/user-progress.dao';
import { EARLY_BONUS } from '../../../config/gamification.config';
import { IModuleProgress, ISubModuleProgress, IUserProgress } from '../../../interfaces/lms-progress.interface';
import { istDay, shiftDay, daysBetween } from '../../../utils/ist-date';
import {
  CourseStructure,
  INITIAL_UNLOCKED_MODULES,
  buildModuleUnlock,
  buildSubModuleUnlock,
  getCourseStructure
} from './course-structure.service';

type Id = Types.ObjectId | string;
type Status = 'locked' | 'unlocked' | 'in_progress' | 'completed';

// "New" badge: added after the student enrolled, within this many days, not yet opened
const NEW_CONTENT_DAYS = 14;

interface Counts {
  contents: number;
  videos: number;
  notes: number;
  mcqs: number;
}

export interface SubModuleOutline {
  id: string;
  title: string;
  order: number;
  status: Status;
  isNew: boolean;
  newCount: number;
  deadlineAt: Date | null;
  // "Finish by <byDate> for +<xp> XP bonus"; null = no bonus left, show nothing
  bonusOffer: { xp: number; byDate: string } | null;
  counts: Counts;
  completedContents: number;
}

export interface ModuleOutline {
  id: string;
  title: string;
  description: string;
  order: number;
  status: Status;
  isNew: boolean;
  newCount: number;
  counts: Counts & { subModules: number };
  completedSubModules: number;
  subModules: SubModuleOutline[];
}

export interface CourseOutline {
  overallProgress: number;
  xpEarned: number;
  newCount: number;
  totals: Counts & { modules: number; subModules: number };
  modules: ModuleOutline[];
}

// Best bonus still reachable, and the last IST day to finish for it
export const bonusOffer = (deadlineAt: Date | null, now: Date): { xp: number; byDate: string } | null => {
  if (!deadlineAt) return null;
  const deadlineDay = istDay(deadlineAt);
  const daysLeft = daysBetween(istDay(now), deadlineDay);
  const tier = EARLY_BONUS.find(b => daysLeft >= b.daysEarly);
  return tier ? { xp: tier.xp, byDate: shiftDay(deadlineDay, -tier.daysEarly) } : null;
};

// Unlock rules, re-applied on every outline load so content an admin adds
// later is picked up:
//   modules:     unlocked = min(total, 3 + completed modules)
//   sub-modules: every active sub-module of an unlocked module
// Completion, XP and certificates are never taken away.
export const healUnlocks = async (
  userId: Id,
  courseId: Id,
  structure: CourseStructure,
  progress: Pick<IUserProgress, 'moduleProgress' | 'subModuleProgress'>,
  now: Date = new Date()
): Promise<void> => {
  const unlockedMods = new Set(progress.moduleProgress.map(m => String(m.module)));
  const unlockedSubs = new Set(progress.subModuleProgress.map(s => String(s.subModule)));
  const newMods: IModuleProgress[] = [];
  const newSubs: ISubModuleProgress[] = [];

  const completedModules = progress.moduleProgress.filter(m => m.completedAt).length;
  const target = Math.min(structure.modules.length, INITIAL_UNLOCKED_MODULES + completedModules);
  let count = structure.modules.filter(m => unlockedMods.has(String(m._id))).length;
  for (const module of structure.modules) {
    if (count >= target) break;
    if (unlockedMods.has(String(module._id))) continue;
    const { moduleEntry } = buildModuleUnlock(module, now);
    newMods.push(moduleEntry);
    unlockedMods.add(String(module._id));
    count++;
  }

  for (const module of structure.modules) {
    if (!unlockedMods.has(String(module._id))) continue;
    for (const subModule of module.subModules) {
      if (unlockedSubs.has(String(subModule._id))) continue;
      newSubs.push(buildSubModuleUnlock(module, subModule, now));
      unlockedSubs.add(String(subModule._id));
    }
  }

  if (!newMods.length && !newSubs.length) return;
  await UserProgressDao.pushUnlocks(userId, courseId, newMods, newSubs);
  progress.moduleProgress.push(...newMods);
  progress.subModuleProgress.push(...newSubs);
};

const emptyCounts = (): Counts => ({ contents: 0, videos: 0, notes: 0, mcqs: 0 });

// Every module is returned; ones not unlocked come back as 'locked' with
// their counts, so students see how much is ahead.
export const getCourseOutline = async (userId: Id, courseId: string, now: Date = new Date()): Promise<CourseOutline | null> => {
  const [structure, progress] = await Promise.all([
    getCourseStructure(courseId),
    UserProgressDao.findByUserAndCourse(
      userId,
      courseId,
      'createdAt overallProgress xpEarned moduleProgress subModuleProgress contentItemProgress.contentId contentItemProgress.subModuleId contentItemProgress.completed'
    )
  ]);
  if (!progress) return null;

  await healUnlocks(userId, courseId, structure, progress, now);

  const enrolledAt = new Date(progress.createdAt).getTime();
  const newCutoff = now.getTime() - NEW_CONTENT_DAYS * 86_400_000;
  const isFresh = (d: Date) => {
    const t = new Date(d).getTime();
    return t > enrolledAt && t > newCutoff;
  };

  const modProg = new Map(progress.moduleProgress.map(m => [String(m.module), m]));
  const subProg = new Map(progress.subModuleProgress.map(s => [String(s.subModule), s]));
  const opened = new Map(
    progress.contentItemProgress.map(c => [`${c.contentId}:${c.subModuleId}`, c.completed])
  );

  const totals = { modules: 0, subModules: 0, ...emptyCounts() };
  let courseNew = 0;

  const modules: ModuleOutline[] = structure.modules.map(m => {
    const mp = modProg.get(String(m._id));
    const mCounts = { subModules: 0, ...emptyCounts() };
    let completedSubModules = 0;
    let moduleNew = 0;

    const subModules: SubModuleOutline[] = m.subModules.map(s => {
      const sp = subProg.get(String(s._id));
      const counts = emptyCounts();
      let completedContents = 0;
      let subNew = 0;
      let anyOpened = false;

      for (const c of s.contents) {
        counts.contents++;
        counts[`${c.contentType}s` as 'videos' | 'notes' | 'mcqs']++;
        const state = opened.get(`${c.contentId}:${s._id}`);
        if (state !== undefined) anyOpened = true;
        if (state === true) completedContents++;
        if (state === undefined && (isFresh(c.createdAt) || c.isNewContent)) subNew++;
      }

      const status: Status =
        !mp || !sp ? 'locked' : sp.completedAt ? 'completed' : anyOpened ? 'in_progress' : 'unlocked';

      if (status === 'completed') completedSubModules++;
      moduleNew += subNew;
      mCounts.subModules++;
      mCounts.contents += counts.contents;
      mCounts.videos += counts.videos;
      mCounts.notes += counts.notes;
      mCounts.mcqs += counts.mcqs;

      return {
        id: String(s._id),
        title: s.title,
        order: s.order,
        status,
        isNew: subNew > 0 || (isFresh(s.createdAt) && !anyOpened),
        newCount: subNew,
        deadlineAt: sp?.deadlineAt ?? null,
        bonusOffer: status === 'locked' || status === 'completed' ? null : bonusOffer(sp?.deadlineAt ?? null, now),
        counts,
        completedContents
      };
    });

    const status: Status = !mp
      ? 'locked'
      : mp.completedAt
        ? 'completed'
        : subModules.some(s => s.status === 'in_progress' || s.status === 'completed')
          ? 'in_progress'
          : 'unlocked';

    totals.modules++;
    totals.subModules += mCounts.subModules;
    totals.contents += mCounts.contents;
    totals.videos += mCounts.videos;
    totals.notes += mCounts.notes;
    totals.mcqs += mCounts.mcqs;
    courseNew += moduleNew;

    return {
      id: String(m._id),
      title: m.title,
      description: m.description,
      order: m.order,
      status,
      isNew: moduleNew > 0 || subModules.some(s => s.isNew) || isFresh(m.createdAt),
      newCount: moduleNew,
      counts: mCounts,
      completedSubModules,
      subModules
    };
  });

  return {
    overallProgress: progress.overallProgress,
    xpEarned: progress.xpEarned,
    newCount: courseNew,
    totals,
    modules
  };
};
