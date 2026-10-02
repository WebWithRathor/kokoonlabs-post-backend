import mongoose, { Types } from 'mongoose';
import Module from '../models/module.model';
import SubModule from '../models/sub-module.model';
import SubmoduleContent from '../models/submodule-content.model';
import Video from '../models/video.model';
import Note from '../models/note.model';
import MCQ from '../models/mcq.model';
import Skill from '../models/skill.model';
import Badge from '../models/badge.model';
import Submission from '../models/submission.model';
import Challenge from '../models/challenge.model';
import UserStats from '../models/user-stats.model';
import Certificate from '../models/certificate.model';
import EnrolledCourseLink from '../models/enrollCourseLink.model';
import { IEnrolledCourseLinkStatus } from '../interfaces/enrolled-course-link.interface';
import {
  ContentModelName,
  IModule,
  ISubModule,
  ISubmoduleContent
} from '../interfaces/lms-content.interface';
import { IBadge, ISkill } from '../interfaces/lms-rewards.interface';

type Id = Types.ObjectId | string;

export const contentModelFor = (name: ContentModelName) =>
  (name === 'Video' ? Video : name === 'Note' ? Note : MCQ) as unknown as mongoose.Model<mongoose.Document>;

export class LmsAdminDao {
  // ---- Full course tree for the admin panel (inactive items included)
  async getTree(courseId: Id) {
    const [modules, subModules, links] = await Promise.all([
      Module.find({ course: courseId }).sort({ order: 1 }).lean<IModule[]>(),
      SubModule.find({ course: courseId }).sort({ order: 1 }).lean<ISubModule[]>(),
      SubmoduleContent.find({ course: courseId }).sort({ order: 1 }).lean<ISubmoduleContent[]>()
    ]);
    const idsOf = (model: ContentModelName) => links.filter(l => l.contentModel === model).map(l => l.contentId);
    const [videos, notes, mcqs] = await Promise.all([
      Video.find({ _id: { $in: idsOf('Video') } }).select('title points duration isActive').lean(),
      Note.find({ _id: { $in: idsOf('Note') } }).select('title points isActive').lean(),
      MCQ.find({ _id: { $in: idsOf('MCQ') } }).select('title points isActive').lean()
    ]);
    const content = new Map<string, Record<string, unknown>>();
    [...videos, ...notes, ...mcqs].forEach(c => content.set(String(c._id), c as unknown as Record<string, unknown>));
    return { modules, subModules, links, content };
  }

  async lastOrder(model: 'module' | 'subModule' | 'content', parentId: Id): Promise<number> {
    const doc =
      model === 'module'
        ? await Module.findOne({ course: parentId }).sort({ order: -1 }).select('order').lean<IModule>()
        : model === 'subModule'
          ? await SubModule.findOne({ module: parentId }).sort({ order: -1 }).select('order').lean<ISubModule>()
          : await SubmoduleContent.findOne({ submodule: parentId }).sort({ order: -1 }).select('order').lean<ISubmoduleContent>();
    return doc?.order ?? 0;
  }

  // ---- Modules
  async createModule(data: Partial<IModule>) {
    return (await Module.create(data)).toObject();
  }
  async findModule(id: Id) {
    return await Module.findById(id);
  }

  // ---- Sub-modules (save() so the maxBonusXp hook runs)
  async createSubModule(data: Partial<ISubModule>) {
    return (await SubModule.create(data)).toObject();
  }
  async findSubModule(id: Id) {
    return await SubModule.findById(id);
  }

  // ---- Content + link
  async createContent(model: ContentModelName, data: Record<string, unknown>) {
    return await contentModelFor(model).create(data);
  }
  async findContent(model: ContentModelName, id: Id) {
    return await contentModelFor(model).findById(id);
  }
  async createLink(data: Partial<ISubmoduleContent>) {
    return (await SubmoduleContent.create(data)).toObject();
  }
  async findLink(id: Id) {
    return await SubmoduleContent.findById(id);
  }
  async deleteContent(model: ContentModelName, id: Id) {
    await contentModelFor(model).deleteOne({ _id: id });
  }

  // ---- Totals (progress points and max bonus XP)
  async setSubModulePoints(updates: { id: Id; points: number }[]) {
    if (!updates.length) return;
    await SubModule.bulkWrite(
      updates.map(u => ({ updateOne: { filter: { _id: u.id }, update: { $set: { points: u.points } } } }))
    );
  }
  async setModuleTotals(updates: { id: Id; totalPoints: number; maxBonusXp: number }[]) {
    if (!updates.length) return;
    await Module.bulkWrite(
      updates.map(u => ({
        updateOne: { filter: { _id: u.id }, update: { $set: { totalPoints: u.totalPoints, maxBonusXp: u.maxBonusXp } } }
      }))
    );
  }

  // ---- Courses (owned by the pre-purchase backend; read-only here)
  async listCourses() {
    const courses = await mongoose.connection
      .collection('courses')
      .find({}, { projection: { title: 1, slug: 1, courseMode: 1, state: 1, type: 1, 'metaData.thumbnail': 1 } })
      .sort({ createdAt: -1 })
      .toArray();
    const [modules, enrollments] = await Promise.all([
      Module.aggregate<{ _id: Types.ObjectId; count: number }>([{ $group: { _id: '$course', count: { $sum: 1 } } }]),
      EnrolledCourseLink.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { status: IEnrolledCourseLinkStatus.SUCCESS } },
        { $group: { _id: '$courseId', count: { $sum: 1 } } }
      ])
    ]);
    const countOf = (rows: { _id: Types.ObjectId; count: number }[], id: unknown) =>
      rows.find(r => String(r._id) === String(id))?.count ?? 0;
    return courses.map(c => ({
      _id: c._id,
      title: c.title,
      slug: c.slug,
      courseMode: c.courseMode,
      state: c.state,
      type: c.type,
      thumbnail: c.metaData?.thumbnail ?? null,
      modules: countOf(modules, c._id),
      students: countOf(enrollments, c._id)
    }));
  }

  // ---- Dashboard counts
  async overview() {
    const [
      pendingReviews, activeChallenges, learners, enrollments, certificates,
      modules, subModules, contents, oldestPending, topLearners
    ] = await Promise.all([
      Submission.countDocuments({ status: 'pending' }),
      Challenge.countDocuments({ isActive: true }),
      UserStats.countDocuments(),
      EnrolledCourseLink.countDocuments({ status: IEnrolledCourseLinkStatus.SUCCESS }),
      Certificate.countDocuments(),
      Module.countDocuments({ isActive: true }),
      SubModule.countDocuments({ isActive: true }),
      SubmoduleContent.countDocuments({ isActive: true }),
      Submission.find({ status: 'pending' })
        .select('challenge user attemptNo createdAt')
        .populate('challenge', 'title maxXp')
        .populate('user', 'name')
        .sort({ createdAt: 1 })
        .limit(5)
        .lean(),
      UserStats.find().select('user totalXp level').populate('user', 'name').sort({ totalXp: -1 }).limit(5).lean()
    ]);
    return {
      counts: { pendingReviews, activeChallenges, learners, enrollments, certificates, modules, subModules, contents },
      oldestPending,
      topLearners
    };
  }

  // ---- One content link with the full video / note / MCQ (for editing)
  async getLinkWithContent(linkId: Id) {
    if (!Types.ObjectId.isValid(String(linkId))) return null;
    const link = await SubmoduleContent.findById(linkId).lean<ISubmoduleContent>();
    if (!link) return null;
    const content = await contentModelFor(link.contentModel).findById(link.contentId).lean();
    return { ...link, content };
  }

  // ---- Skills
  async listSkills() {
    return await Skill.find().sort({ name: 1 }).lean<ISkill[]>();
  }
  async createSkill(data: Partial<ISkill>) {
    return (await Skill.create(data)).toObject();
  }
  async updateSkill(id: Id, data: Partial<ISkill>) {
    return await Skill.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean<ISkill>();
  }

  // ---- Badges
  async listBadges() {
    return await Badge.find().sort({ ruleType: 1, threshold: 1 }).lean<IBadge[]>();
  }
  async createBadge(data: Partial<IBadge>) {
    return (await Badge.create(data)).toObject();
  }
  async updateBadge(id: Id, data: Partial<IBadge>) {
    return await Badge.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean<IBadge>();
  }
}

export default new LmsAdminDao();
