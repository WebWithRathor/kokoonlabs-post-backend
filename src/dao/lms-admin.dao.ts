import mongoose, { Types } from 'mongoose';
import Module from '../models/module.model';
import SubModule from '../models/sub-module.model';
import SubmoduleContent from '../models/submodule-content.model';
import Video from '../models/video.model';
import Note from '../models/note.model';
import MCQ from '../models/mcq.model';
import Skill from '../models/skill.model';
import Badge from '../models/badge.model';
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
