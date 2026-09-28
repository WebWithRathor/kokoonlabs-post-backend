import { Types } from 'mongoose';
import CourseStructureDao from '../../../dao/course-structure.dao';
import UserProgressDao from '../../../dao/user-progress.dao';
import LmsEnrollmentDao from '../../../dao/lms-enrollment.dao';
import ErrorHandler from '../../../utils/error-handler';
import { COPY, contentXp } from '../../../config/gamification.config';
import { CONTENT_MODEL_BY_TYPE, ISubmoduleContent } from '../../../interfaces/lms-content.interface';
import { IContentItemProgress, IModuleProgress, ISubModuleProgress } from '../../../interfaces/lms-progress.interface';
import { scoreMcq } from '../../../utils/mcq-scoring';
import logger from '../../../config/logger';
import { PlaybackInfo, getPlaybackOtp } from '../../../utils/vdocipher';
import { isVideoComplete, mergeWatched } from '../../../utils/video-watch';
import { INITIAL_UNLOCKED_MODULES, buildModuleUnlock, getCourseStructure } from './course-structure.service';
import { Celebration, completeContentItem } from './completion.service';

type Id = Types.ObjectId | string;

// Who is learning, and in which enrollment — built by the controller
export interface LearnerContext {
  userId: Id;
  userName: string;
  courseId: string;
  courseName: string;
  batchId?: Id;
}

const notFound = (what: string) => new ErrorHandler(404, `${what} not found`);
const locked = () => new ErrorHandler(403, COPY.moduleLocked);

// ---------------------------------------------------------------------
// Start: first open of the course. Unlocks the first 3 modules with all
// their sub-modules. Safe to call again (creates only once).
// ---------------------------------------------------------------------
export const startCourse = async (ctx: LearnerContext, now: Date = new Date()): Promise<{ started: boolean }> => {
  const structure = await getCourseStructure(ctx.courseId);
  const modules: IModuleProgress[] = [];
  const subModules: ISubModuleProgress[] = [];
  for (const module of structure.modules.slice(0, INITIAL_UNLOCKED_MODULES)) {
    const { moduleEntry, subModuleEntries } = buildModuleUnlock(module, now);
    modules.push(moduleEntry);
    subModules.push(...subModuleEntries);
  }
  const started = await UserProgressDao.createIfMissing(ctx.userId, ctx.courseId, modules, subModules);
  return { started };
};

const requireProgress = async (ctx: LearnerContext) => {
  const progress = await UserProgressDao.findByUserAndCourse(
    ctx.userId,
    ctx.courseId,
    'subModuleProgress contentItemProgress.contentId contentItemProgress.subModuleId contentItemProgress.completed contentItemProgress.attempts'
  );
  if (!progress) throw new ErrorHandler(409, 'Course not started yet');
  return progress;
};

// ---------------------------------------------------------------------
// Sub-module page: its content list with completion ticks
// ---------------------------------------------------------------------
export const getSubModule = async (ctx: LearnerContext, subModuleId: string) => {
  const [structure, progress] = await Promise.all([getCourseStructure(ctx.courseId), requireProgress(ctx)]);
  const located = structure.subModules.get(subModuleId);
  if (!located) throw notFound('Sub-module');
  const entry = progress.subModuleProgress.find(s => String(s.subModule) === subModuleId);
  if (!entry) throw locked();

  const items = located.subModule.contents.map(c => {
    const p = progress.contentItemProgress.find(
      i => String(i.contentId) === String(c.contentId) && String(i.subModuleId) === subModuleId
    );
    const summary = structure.content.get(String(c.contentId));
    return {
      linkId: String(c.linkId),
      contentType: c.contentType,
      title: summary?.title ?? '',
      duration: summary?.duration,
      order: c.order,
      completed: !!p?.completed,
      opened: !!p
    };
  });

  return {
    id: subModuleId,
    title: located.subModule.title,
    moduleId: String(located.module._id),
    deadlineAt: entry.deadlineAt,
    completed: !!entry.completedAt,
    items
  };
};

// Link must belong to this course and sit in an unlocked sub-module
const resolveLink = async (ctx: LearnerContext, linkId: string): Promise<ISubmoduleContent> => {
  const link = await CourseStructureDao.findLink(linkId, ctx.courseId);
  if (!link) throw notFound('Content');
  const progress = await requireProgress(ctx);
  if (!progress.subModuleProgress.some(s => String(s.subModule) === String(link.submodule))) throw locked();
  return link;
};

const getEntry = async (ctx: LearnerContext, link: ISubmoduleContent): Promise<IContentItemProgress> => {
  const existing = await UserProgressDao.findContentEntry(ctx.userId, ctx.courseId, link.contentId, link.submodule);
  if (existing) return existing;
  await UserProgressDao.ensureContentEntry(ctx.userId, ctx.courseId, {
    contentType: link.contentType,
    contentId: link.contentId,
    contentModel: CONTENT_MODEL_BY_TYPE[link.contentType],
    subModuleId: link.submodule
  });
  return (await UserProgressDao.findContentEntry(ctx.userId, ctx.courseId, link.contentId, link.submodule))!;
};

const completionInput = (ctx: LearnerContext, link: ISubmoduleContent, points: number, mcqBestScore?: number) => ({
  userId: ctx.userId,
  userName: ctx.userName,
  courseId: ctx.courseId,
  courseName: ctx.courseName,
  batchId: ctx.batchId,
  contentId: link.contentId,
  subModuleId: link.submodule,
  contentType: link.contentType,
  points,
  mcqBestScore
});

// ---------------------------------------------------------------------
// Open a content item: returns it (MCQ answers hidden until done), creates
// its progress entry, and saves it as "continue where you left off"
// ---------------------------------------------------------------------
const tryPlayback = async (provider: string | undefined, videoId: string, userId: Id): Promise<PlaybackInfo | null> => {
  if ((provider ?? 'vdocipher') !== 'vdocipher') return null;
  try {
    return await getPlaybackOtp(videoId, String(userId));
  } catch (e) {
    logger.warn('Playback OTP unavailable on open', { videoId, error: (e as Error).message });
    return null;
  }
};

// Fresh OTP for an unlocked video (OTPs are short-lived: call before each play)
export const getPlayback = async (ctx: LearnerContext, linkId: string): Promise<PlaybackInfo> => {
  const link = await resolveLink(ctx, linkId);
  if (link.contentType !== 'video') throw new ErrorHandler(400, 'Not a video');
  const video = await CourseStructureDao.findVideo(link.contentId);
  if (!video) throw notFound('Video');
  if ((video.provider ?? 'vdocipher') !== 'vdocipher') throw new ErrorHandler(400, 'This video does not use VdoCipher');
  return await getPlaybackOtp(video.videoId, String(ctx.userId));
};

export const openContent = async (ctx: LearnerContext, linkId: string) => {
  const link = await resolveLink(ctx, linkId);
  const entry = await getEntry(ctx, link);

  let content: Record<string, unknown> | null = null;
  if (link.contentType === 'video') {
    const v = await CourseStructureDao.findVideo(link.contentId);
    if (v) {
      content = { title: v.title, description: v.description, videoId: v.videoId, provider: v.provider, duration: v.duration, links: v.links };
      // Page still opens if VdoCipher is down; the player can retry via /playback
      content.playback = await tryPlayback(v.provider, v.videoId, ctx.userId);
    }
  } else if (link.contentType === 'note') {
    const n = await CourseStructureDao.findNote(link.contentId);
    if (n) content = { title: n.title, description: n.description, url: n.content, images: n.images };
  } else {
    const q = await CourseStructureDao.findMcq(link.contentId);
    if (q) {
      const reveal = entry.completed;
      content = {
        title: q.title,
        question: q.question,
        image: q.image,
        codeSnippets: q.codeSnippets,
        selectionType: q.selectionType,
        maxAttempts: q.maxAttempts,
        // isCorrect and the explanation only once the question is done
        options: q.options.map(o => (reveal ? { text: o.text, isCorrect: o.isCorrect } : { text: o.text })),
        explanation: reveal ? q.explanation : undefined
      };
    }
  }
  if (!content) throw notFound('Content');

  await LmsEnrollmentDao.setLastViewed(ctx.userId, ctx.courseId, {
    contentId: link.contentId,
    submoduleId: link.submodule,
    moduleId: link.module,
    contentType: link.contentType,
    title: String(content.title ?? ''),
    viewedAt: new Date()
  });

  return {
    linkId,
    contentType: link.contentType,
    content,
    progress: {
      completed: entry.completed,
      lastPositionSeconds: entry.lastPositionSeconds ?? 0,
      watchedSeconds: entry.watchedDuration ?? 0,
      attempts: entry.attempts ?? 0,
      selectedOptions: entry.selectedOptions ?? []
    }
  };
};

// ---------------------------------------------------------------------
// Video heartbeat: the player reports the range just watched (~every 15 s).
// Auto-completes at 70% of unique seconds. Send heartbeats one at a time.
// ---------------------------------------------------------------------
export const videoHeartbeat = async (
  ctx: LearnerContext,
  linkId: string,
  body: { start: number; end: number; position: number }
): Promise<{ watchedSeconds: number; duration: number; completed: boolean; celebration: Celebration | null }> => {
  const link = await resolveLink(ctx, linkId);
  if (link.contentType !== 'video') throw new ErrorHandler(400, 'Not a video');
  const video = await CourseStructureDao.findVideo(link.contentId);
  if (!video) throw notFound('Video');
  const entry = await getEntry(ctx, link);

  const { intervals, watchedSeconds } = mergeWatched(
    (entry.watchedIntervals ?? []) as [number, number][],
    [body.start, body.end],
    video.duration
  );
  await UserProgressDao.saveVideoProgress(ctx.userId, ctx.courseId, link.contentId, link.submodule, {
    watchedIntervals: intervals,
    watchedDuration: watchedSeconds,
    lastPositionSeconds: Math.max(0, Math.min(video.duration, body.position))
  });

  let celebration: Celebration | null = null;
  if (!entry.completed && isVideoComplete(watchedSeconds, video.duration)) {
    celebration = await completeContentItem(completionInput(ctx, link, video.points));
  }
  return {
    watchedSeconds,
    duration: video.duration,
    completed: entry.completed || !!celebration,
    celebration
  };
};

// ---------------------------------------------------------------------
// Note: "Mark as done"
// ---------------------------------------------------------------------
export const markNoteDone = async (ctx: LearnerContext, linkId: string): Promise<{ celebration: Celebration }> => {
  const link = await resolveLink(ctx, linkId);
  if (link.contentType !== 'note') throw new ErrorHandler(400, 'Not a note');
  const note = await CourseStructureDao.findNote(link.contentId);
  if (!note) throw notFound('Note');
  await getEntry(ctx, link);
  return { celebration: await completeContentItem(completionInput(ctx, link, note.points)) };
};

// ---------------------------------------------------------------------
// MCQ attempt. Done when fully correct OR attempts used up; then the
// answers and explanation are revealed and the item completes.
// ---------------------------------------------------------------------
export const submitMcqAttempt = async (ctx: LearnerContext, linkId: string, selected: number[]) => {
  const link = await resolveLink(ctx, linkId);
  if (link.contentType !== 'mcq') throw new ErrorHandler(400, 'Not an MCQ');
  const mcq = await CourseStructureDao.findMcq(link.contentId);
  if (!mcq) throw notFound('MCQ');
  const entry = await getEntry(ctx, link);

  const attemptsUsed = entry.attempts ?? 0;
  if (entry.completed || attemptsUsed >= mcq.maxAttempts) {
    throw new ErrorHandler(409, 'This question is already done');
  }
  if (mcq.selectionType === 'single' && selected.length !== 1) {
    throw new ErrorHandler(400, 'Pick exactly one option');
  }

  const score = scoreMcq(mcq.options, selected, mcq.selectionType);
  const bestScore = Math.max(entry.bestScore ?? 0, score.fraction);
  const recorded = await UserProgressDao.recordMcqAttempt(
    ctx.userId, ctx.courseId, link.contentId, link.submodule, attemptsUsed, selected, bestScore
  );
  if (!recorded) throw new ErrorHandler(409, 'That attempt was already submitted. Refresh and try again.');

  const attempts = attemptsUsed + 1;
  const triesLeft = Math.max(0, mcq.maxAttempts - attempts);
  const done = score.isFullyCorrect || triesLeft === 0;

  const message = score.isFullyCorrect
    ? COPY.mcqCorrect(contentXp('mcq', bestScore))
    : done
      ? COPY.mcqOutOfTries
      : score.fraction > 0
        ? COPY.mcqPartly(triesLeft)
        : COPY.mcqWrong(triesLeft);

  const celebration = done ? await completeContentItem(completionInput(ctx, link, mcq.points, bestScore)) : null;

  return {
    correct: score.isFullyCorrect,
    scorePercent: Math.round(score.fraction * 100),
    attempts,
    triesLeft,
    done,
    message,
    // Revealed only once the question is done
    answer: done
      ? { options: mcq.options.map(o => ({ text: o.text, isCorrect: o.isCorrect })), explanation: mcq.explanation }
      : null,
    celebration
  };
};
