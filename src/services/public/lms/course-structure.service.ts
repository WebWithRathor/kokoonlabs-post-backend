import { Types } from 'mongoose';
import CourseStructureDao, {
  ContentSummary,
  StructModule,
  StructSubModule
} from '../../../dao/course-structure.dao';
import { maxBonusForDeadline } from '../../../config/gamification.config';
import { IModuleProgress, ISubModuleProgress } from '../../../interfaces/lms-progress.interface';

// The course structure is the same for every student, so it is cached per
// course. Every admin edit to modules / sub-modules / content must call
// invalidateCourseStructure(courseId). With more than one Node server,
// move this cache to Redis so all servers see the invalidation.
const CACHE_TTL_MS = 10 * 60_000;

export const INITIAL_UNLOCKED_MODULES = 3;

export interface CourseStructure {
  modules: StructModule[];
  content: Map<string, ContentSummary>;   // by content id
  subModules: Map<string, { subModule: StructSubModule; module: StructModule }>;
  totalPoints: number;                    // progress points of the whole course
  maxBonusXp: number;                     // highest bonus XP the course can give
}

const cache = new Map<string, { at: number; data: CourseStructure }>();

export const invalidateCourseStructure = (courseId: string | Types.ObjectId): void => {
  cache.delete(String(courseId));
};

export const getCourseStructure = async (courseId: string): Promise<CourseStructure> => {
  const hit = cache.get(courseId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const modules = await CourseStructureDao.getStructure(courseId);
  const allContents = modules.flatMap(m => m.subModules.flatMap(s => s.contents));
  const content = await CourseStructureDao.getContentSummaries(allContents);

  const subModules = new Map<string, { subModule: StructSubModule; module: StructModule }>();
  let totalPoints = 0;
  let maxBonusXp = 0;
  for (const module of modules) {
    for (const subModule of module.subModules) {
      subModules.set(String(subModule._id), { subModule, module });
      maxBonusXp += maxBonusForDeadline(subModule.deadlineDays);
      for (const c of subModule.contents) totalPoints += content.get(String(c.contentId))?.points ?? 0;
    }
  }

  const data: CourseStructure = { modules, content, subModules, totalPoints, maxBonusXp };
  cache.set(courseId, { at: Date.now(), data });
  return data;
};

// A module unlocks together with ALL its active sub-modules. Each sub-module's
// deadline is frozen now: unlock time + its deadlineDays.
export const buildModuleUnlock = (
  module: StructModule,
  now: Date,
  skipSubModules: Set<string> = new Set()
): { moduleEntry: IModuleProgress; subModuleEntries: ISubModuleProgress[] } => ({
  moduleEntry: { module: module._id, unlockedAt: now, completedAt: null, xpAwarded: 0 },
  subModuleEntries: module.subModules
    .filter(s => !skipSubModules.has(String(s._id)))
    .map(s => buildSubModuleUnlock(module, s, now))
});

export const buildSubModuleUnlock = (
  module: StructModule,
  subModule: StructSubModule,
  now: Date
): ISubModuleProgress => ({
  subModule: subModule._id,
  module: module._id,
  unlockedAt: now,
  deadlineAt: subModule.deadlineDays ? new Date(now.getTime() + subModule.deadlineDays * 86_400_000) : null,
  completedAt: null,
  xpAwarded: 0,
  bonusXp: 0
});

// Progress %: whole number, capped at 100
export const progressPercent = (pointsEarned: number, totalPoints: number): number =>
  totalPoints > 0 ? Math.min(100, Math.round((pointsEarned / totalPoints) * 100)) : 0;
