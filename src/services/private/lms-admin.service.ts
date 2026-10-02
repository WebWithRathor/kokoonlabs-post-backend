import { Types } from 'mongoose';
import LmsAdminDao from '../../dao/lms-admin.dao';
import ErrorHandler from '../../utils/error-handler';
import { maxBonusForDeadline } from '../../config/gamification.config';
import {
  CONTENT_MODEL_BY_TYPE,
  ContentType,
  IModule,
  ISubModule,
  ISubModuleSkill
} from '../../interfaces/lms-content.interface';
import { IBadge, ISkill } from '../../interfaces/lms-rewards.interface';
import {
  getCourseStructure,
  invalidateCourseStructure
} from '../public/lms/course-structure.service';

type Id = Types.ObjectId | string;

// Gapped order values (1000, 2000...) so an item can be moved between two
// others with a single update
const ORDER_STEP = 1000;

// Fields an admin may set on each content type. Anything else is ignored.
const CONTENT_FIELDS: Record<ContentType, string[]> = {
  video: ['title', 'description', 'videoId', 'provider', 'duration', 'points', 'links', 'tags', 'classId', 'isActive'],
  note: ['title', 'content', 'description', 'images', 'points', 'tags', 'isActive'],
  mcq: [
    'title', 'question', 'image', 'codeSnippets', 'options', 'selectionType', 'maxAttempts',
    'points', 'explanation', 'difficulty', 'tags', 'isActive'
  ]
};

const pick = <T extends object>(data: T, keys: string[]): Partial<T> => {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (data as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
};

const notFound = (what: string) => new ErrorHandler(404, `${what} not found`);

// ---------------------------------------------------------------------
// Totals: sub-module points, module totals, and the course cache.
// Runs after EVERY content edit so progress % and certificates stay right.
// ---------------------------------------------------------------------
export const recalculateCourse = async (courseId: Id) => {
  invalidateCourseStructure(courseId);
  const structure = await getCourseStructure(String(courseId));

  const subUpdates: { id: Id; points: number }[] = [];
  const moduleUpdates: { id: Id; totalPoints: number; maxBonusXp: number }[] = [];
  for (const module of structure.modules) {
    let modulePoints = 0;
    let moduleBonus = 0;
    for (const sub of module.subModules) {
      const points = sub.contents.reduce((sum, c) => sum + (structure.content.get(String(c.contentId))?.points ?? 0), 0);
      subUpdates.push({ id: sub._id, points });
      modulePoints += points;
      moduleBonus += maxBonusForDeadline(sub.deadlineDays);
    }
    moduleUpdates.push({ id: module._id, totalPoints: modulePoints, maxBonusXp: moduleBonus });
  }
  await LmsAdminDao.setSubModulePoints(subUpdates);
  await LmsAdminDao.setModuleTotals(moduleUpdates);
  return { courseTotalPoints: structure.totalPoints, courseMaxBonusXp: structure.maxBonusXp };
};

// ---------------------------------------------------------------------
// Tree (admin view, inactive items included)
// ---------------------------------------------------------------------
export const getCourseTree = async (courseId: string) => {
  const { modules, subModules, links, content } = await LmsAdminDao.getTree(courseId);
  return {
    modules: modules.map(m => ({
      ...m,
      subModules: subModules
        .filter(s => String(s.module) === String(m._id))
        .map(s => ({
          ...s,
          contents: links
            .filter(l => String(l.submodule) === String(s._id))
            .map(l => ({ ...l, content: content.get(String(l.contentId)) ?? null }))
        }))
    }))
  };
};

// ---------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------
export const createModule = async (data: { course: string; title: string; description: string; order?: number }) => {
  const order = data.order ?? (await LmsAdminDao.lastOrder('module', data.course)) + ORDER_STEP;
  const module = await LmsAdminDao.createModule({ ...pick(data, ['title', 'description']), course: new Types.ObjectId(data.course), order } as Partial<IModule>);
  await recalculateCourse(data.course);
  return module;
};

export const updateModule = async (id: string, data: Partial<IModule>) => {
  const module = await LmsAdminDao.findModule(id);
  if (!module) throw notFound('Module');
  module.set(pick(data, ['title', 'description', 'order', 'isActive']));
  await module.save();
  await recalculateCourse(module.course);
  return module.toObject();
};

// ---------------------------------------------------------------------
// Sub-modules
// ---------------------------------------------------------------------
export const createSubModule = async (data: {
  module: string;
  title: string;
  description: string;
  order?: number;
  deadlineDays?: number | null;
  skills?: ISubModuleSkill[];
}) => {
  const module = await LmsAdminDao.findModule(data.module);
  if (!module) throw notFound('Module');
  const order = data.order ?? (await LmsAdminDao.lastOrder('subModule', data.module)) + ORDER_STEP;
  const sub = await LmsAdminDao.createSubModule({
    ...pick(data, ['title', 'description', 'deadlineDays', 'skills']),
    module: module._id,
    course: module.course,
    order
  } as Partial<ISubModule>);
  await recalculateCourse(module.course);
  return sub;
};

export const updateSubModule = async (id: string, data: Partial<ISubModule>) => {
  const sub = await LmsAdminDao.findSubModule(id);
  if (!sub) throw notFound('Sub-module');
  sub.set(pick(data, ['title', 'description', 'order', 'deadlineDays', 'skills', 'isActive']));
  await sub.save(); // save hook recalculates maxBonusXp from deadlineDays
  await recalculateCourse(sub.course);
  return sub.toObject();
};

// ---------------------------------------------------------------------
// Content (video / note / MCQ) and its link to a sub-module
// ---------------------------------------------------------------------
export const addContent = async (
  subModuleId: string,
  data: { contentType: ContentType; content?: Record<string, unknown>; contentId?: string; order?: number; isNewContent?: boolean }
) => {
  const sub = await LmsAdminDao.findSubModule(subModuleId);
  if (!sub) throw notFound('Sub-module');
  const model = CONTENT_MODEL_BY_TYPE[data.contentType];

  // Reuse an existing video/note/MCQ, or create a new one
  let contentId: Types.ObjectId;
  let created = false;
  if (data.contentId) {
    const existing = await LmsAdminDao.findContent(model, data.contentId);
    if (!existing) throw notFound('Content');
    contentId = existing._id as Types.ObjectId;
  } else {
    const doc = await LmsAdminDao.createContent(model, pick(data.content ?? {}, CONTENT_FIELDS[data.contentType]));
    contentId = doc._id as Types.ObjectId;
    created = true;
  }

  try {
    const order = data.order ?? (await LmsAdminDao.lastOrder('content', sub._id)) + ORDER_STEP;
    const link = await LmsAdminDao.createLink({
      submodule: sub._id,
      module: sub.module,
      course: sub.course,
      contentType: data.contentType,
      contentId,
      contentModel: model,
      order,
      isNewContent: !!data.isNewContent
    });
    await recalculateCourse(sub.course);
    return link;
  } catch (e) {
    // Don't leave an orphan content document behind
    if (created) await LmsAdminDao.deleteContent(model, contentId);
    if ((e as { code?: number }).code === 11000) throw new ErrorHandler(409, 'This content is already in the sub-module');
    throw e;
  }
};

// Updates the link (order / active / "New" flag) and, when sent, the content itself.
// MCQ note: don't reorder or remove options once students have attempted it —
// saved answers are option positions.
export const updateContent = async (
  linkId: string,
  data: { order?: number; isActive?: boolean; isNewContent?: boolean; content?: Record<string, unknown> }
) => {
  const link = await LmsAdminDao.findLink(linkId);
  if (!link) throw notFound('Content');
  link.set(pick(data, ['order', 'isActive', 'isNewContent']));
  await link.save();

  if (data.content) {
    const doc = await LmsAdminDao.findContent(link.contentModel, link.contentId);
    if (!doc) throw notFound('Content');
    doc.set(pick(data.content, CONTENT_FIELDS[link.contentType]));
    await doc.save(); // runs validators and hooks (e.g. MCQ correct-option checks)
  }
  await recalculateCourse(link.course);
  return link.toObject();
};

// Soft remove: hides it from students; progress already earned stays
export const removeContent = async (linkId: string) => updateContent(linkId, { isActive: false });

export const getContent = async (linkId: string) => {
  const link = await LmsAdminDao.getLinkWithContent(linkId);
  if (!link || !link.content) throw notFound('Content');
  return link;
};

// ---------------------------------------------------------------------
// Courses and dashboard
// ---------------------------------------------------------------------
export const listCourses = () => LmsAdminDao.listCourses();
export const getOverview = () => LmsAdminDao.overview();

// ---------------------------------------------------------------------
// Skills and badges
// ---------------------------------------------------------------------
export const listSkills = () => LmsAdminDao.listSkills();
export const createSkill = (data: Partial<ISkill>) => LmsAdminDao.createSkill(pick(data, ['name', 'slug', 'description', 'icon']));
export const updateSkill = async (id: string, data: Partial<ISkill>) => {
  const skill = await LmsAdminDao.updateSkill(id, pick(data, ['name', 'slug', 'description', 'icon', 'isActive']));
  if (!skill) throw notFound('Skill');
  return skill;
};

export const listBadges = () => LmsAdminDao.listBadges();
export const createBadge = (data: Partial<IBadge>) =>
  LmsAdminDao.createBadge(pick(data, ['name', 'description', 'icon', 'ruleType', 'threshold']));
export const updateBadge = async (id: string, data: Partial<IBadge>) => {
  const badge = await LmsAdminDao.updateBadge(id, pick(data, ['name', 'description', 'icon', 'ruleType', 'threshold', 'isActive']));
  if (!badge) throw notFound('Badge');
  return badge;
};
