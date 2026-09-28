import mongoose, { Types } from 'mongoose';
import Module from '../models/module.model';
import SubModule from '../models/sub-module.model';
import SubmoduleContent from '../models/submodule-content.model';
import Video from '../models/video.model';
import Note from '../models/note.model';
import MCQ from '../models/mcq.model';
import {
  ContentModelName,
  ContentType,
  ISubmoduleContent,
  ISubModuleSkill
} from '../interfaces/lms-content.interface';

export interface StructContent {
  linkId: Types.ObjectId;          // SubmoduleContent _id
  contentId: Types.ObjectId;
  contentType: ContentType;
  contentModel: ContentModelName;
  order: number;
  createdAt: Date;
  isNewContent: boolean;
}

export interface StructSubModule {
  _id: Types.ObjectId;
  title: string;
  order: number;
  deadlineDays: number | null;
  skills: ISubModuleSkill[];
  createdAt: Date;
  contents: StructContent[];
}

export interface StructModule {
  _id: Types.ObjectId;
  title: string;
  description: string;
  order: number;
  createdAt: Date;
  subModules: StructSubModule[];
}

export interface ContentSummary {
  title: string;
  points: number;
  duration?: number;
}

export class CourseStructureDao {
  // Active modules -> active sub-modules -> active content links, in order.
  // One aggregation (MongoDB 5.0+: $lookup with localField + pipeline).
  async getStructure(courseId: string): Promise<StructModule[]> {
    return await Module.aggregate<StructModule>([
      { $match: { course: new mongoose.Types.ObjectId(courseId), isActive: true } },
      { $sort: { order: 1 } },
      {
        $lookup: {
          from: SubModule.collection.name,
          localField: '_id',
          foreignField: 'module',
          pipeline: [
            { $match: { isActive: true } },
            { $sort: { order: 1 } },
            {
              $lookup: {
                from: SubmoduleContent.collection.name,
                localField: '_id',
                foreignField: 'submodule',
                pipeline: [
                  { $match: { isActive: true } },
                  { $sort: { order: 1 } },
                  {
                    $project: {
                      _id: 0,
                      linkId: '$_id',
                      contentId: 1,
                      contentType: 1,
                      contentModel: 1,
                      order: 1,
                      createdAt: 1,
                      isNewContent: 1
                    }
                  }
                ],
                as: 'contents'
              }
            },
            { $project: { title: 1, order: 1, deadlineDays: 1, skills: 1, createdAt: 1, contents: 1 } }
          ],
          as: 'subModules'
        }
      },
      { $project: { title: 1, description: 1, order: 1, createdAt: 1, subModules: 1 } }
    ]);
  }

  // Title, progress points and (for videos) duration of each content item,
  // keyed by content id
  async getContentSummaries(contents: StructContent[]): Promise<Map<string, ContentSummary>> {
    const ids = (model: ContentModelName) =>
      contents.filter(c => c.contentModel === model).map(c => c.contentId);
    const [videos, notes, mcqs] = await Promise.all([
      Video.find({ _id: { $in: ids('Video') } }).select('title points duration').lean(),
      Note.find({ _id: { $in: ids('Note') } }).select('title points').lean(),
      MCQ.find({ _id: { $in: ids('MCQ') } }).select('title points').lean()
    ]);
    const map = new Map<string, ContentSummary>();
    for (const v of videos) map.set(String(v._id), { title: v.title, points: v.points ?? 0, duration: v.duration });
    for (const n of notes) map.set(String(n._id), { title: n.title, points: n.points ?? 0 });
    for (const m of mcqs) map.set(String(m._id), { title: m.title, points: m.points ?? 0 });
    return map;
  }

  async findLink(linkId: string, courseId: string): Promise<ISubmoduleContent | null> {
    if (!mongoose.Types.ObjectId.isValid(linkId)) return null;
    return await SubmoduleContent.findOne({ _id: linkId, course: courseId, isActive: true }).lean<ISubmoduleContent>();
  }

  async findVideo(id: Types.ObjectId) {
    return await Video.findOne({ _id: id, isActive: true }).lean();
  }

  async findNote(id: Types.ObjectId) {
    return await Note.findOne({ _id: id, isActive: true }).lean();
  }

  async findMcq(id: Types.ObjectId) {
    return await MCQ.findOne({ _id: id, isActive: true }).lean();
  }
}

export default new CourseStructureDao();
