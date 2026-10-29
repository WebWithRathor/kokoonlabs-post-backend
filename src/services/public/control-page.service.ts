import mongoose from 'mongoose';
import ControlPageModel from '../../models/control-page.model';
import ProjectModel from '../../models/project.model';
import { ControlPageKind, CONTROL_PAGE_KINDS, IControlPageLayout } from '../../interfaces/control-page.interface';
import ErrorHandler from '../../utils/error-handler';
import { sanitizeControlPage } from '../../utils/control-page';

// A student's saved Bluetooth / WiFi pages. Each one is connected to one of
// their projects at most, and a project has one page of each kind: connecting
// a page disconnects the project's other page of that kind.

export const MAX_CONTROL_PAGES = 200;

export interface ControlPageView {
  _id: string;
  name: string;
  kind: ControlPageKind;
  layout: IControlPageLayout;
  projectId: string | null;
  project: { _id: string; title: string } | null;
  updatedAt: Date;
}

export interface ControlPageInput {
  name?: unknown;
  kind?: unknown;
  layout?: unknown;
  projectId?: unknown;
}

type Populated = {
  _id: mongoose.Types.ObjectId;
  name: string;
  kind: ControlPageKind;
  layout: IControlPageLayout;
  projectId: { _id: mongoose.Types.ObjectId; title: string } | null;
  updatedAt: Date;
};

const toView = (p: Populated): ControlPageView => ({
  _id: String(p._id),
  name: p.name,
  kind: p.kind,
  layout: p.layout,
  // A deleted project counts as not connected
  projectId: p.projectId ? String(p.projectId._id) : null,
  project: p.projectId ? { _id: String(p.projectId._id), title: p.projectId.title } : null,
  updatedAt: p.updatedAt
});

const findView = async (userId: string, id: string | mongoose.Types.ObjectId): Promise<ControlPageView> => {
  const page = await ControlPageModel.findOne({ _id: id, userId }).populate('projectId', 'title').lean<Populated>().exec();
  if (!page) throw new ErrorHandler(404, 'Page not found');
  return toView(page);
};

const cleanName = (v: unknown, fallback: string) =>
  Array.from(String(v ?? ''))
    .filter((ch) => ch >= ' ' && ch !== '\u007f')
    .join('')
    .trim()
    .slice(0, 40) || fallback;

const readLayout = (v: unknown): IControlPageLayout => {
  const layout = sanitizeControlPage(v);
  if (!layout) throw new ErrorHandler(400, 'That page could not be read');
  return layout;
};

/** The project id to connect, after checking it's the student's (null: disconnect). */
const ownProject = async (userId: string, v: unknown): Promise<string | null> => {
  if (v === null || v === undefined || v === '') return null;
  const id = String(v);
  if (!mongoose.Types.ObjectId.isValid(id) || !(await ProjectModel.findOne({ _id: id, userId }).select('_id').lean().exec())) {
    throw new ErrorHandler(404, 'Project not found');
  }
  return id;
};

const disconnectOthers = (userId: string, projectId: string, kind: ControlPageKind, keep: mongoose.Types.ObjectId) =>
  ControlPageModel.updateMany({ userId, projectId, kind, _id: { $ne: keep } }, { $set: { projectId: null } }).exec();

const roomForOneMore = async (userId: string) => {
  if ((await ControlPageModel.countDocuments({ userId }).exec()) >= MAX_CONTROL_PAGES) {
    throw new ErrorHandler(400, `You can keep up to ${MAX_CONTROL_PAGES} pages. Delete some on your profile first.`);
  }
};

export const listControlPagesService = async (userId: string, kind?: string): Promise<{ pages: ControlPageView[] }> => {
  const filter: Record<string, unknown> = { userId };
  if (kind && CONTROL_PAGE_KINDS.includes(kind as ControlPageKind)) filter.kind = kind;
  const pages = await ControlPageModel.find(filter)
    .sort({ updatedAt: -1 })
    .limit(MAX_CONTROL_PAGES)
    .populate('projectId', 'title')
    .lean<Populated[]>()
    .exec();
  return { pages: pages.map(toView) };
};

export const createControlPageService = async (userId: string, data: ControlPageInput): Promise<ControlPageView> => {
  const kind = data.kind as ControlPageKind;
  if (!CONTROL_PAGE_KINDS.includes(kind)) throw new ErrorHandler(400, 'A page is for Bluetooth or WiFi');
  const layout = readLayout(data.layout);
  const projectId = await ownProject(userId, data.projectId);
  await roomForOneMore(userId);
  const page = await ControlPageModel.create({ userId, kind, layout, projectId, name: cleanName(data.name, layout.title) });
  if (projectId) await disconnectOthers(userId, projectId, kind, page._id);
  return findView(userId, page._id);
};

export const updateControlPageService = async (userId: string, id: string, data: ControlPageInput): Promise<ControlPageView> => {
  const page = await ControlPageModel.findOne({ _id: id, userId }).exec();
  if (!page) throw new ErrorHandler(404, 'Page not found');
  if (data.layout !== undefined) page.layout = readLayout(data.layout);
  if (data.name !== undefined) page.name = cleanName(data.name, page.layout.title);
  if (data.projectId !== undefined) page.projectId = await ownProject(userId, data.projectId);
  page.markModified('layout');
  await page.save();
  if (page.projectId) await disconnectOthers(userId, String(page.projectId), page.kind, page._id);
  return findView(userId, page._id);
};

/** A copy that isn't connected to a project (to use in another one). */
export const copyControlPageService = async (userId: string, id: string): Promise<ControlPageView> => {
  const page = await ControlPageModel.findOne({ _id: id, userId }).lean().exec();
  if (!page) throw new ErrorHandler(404, 'Page not found');
  await roomForOneMore(userId);
  const copy = await ControlPageModel.create({
    userId,
    kind: page.kind,
    layout: page.layout,
    projectId: null,
    name: cleanName(`${page.name.slice(0, 35)} copy`, page.layout.title)
  });
  return findView(userId, copy._id);
};

export const deleteControlPageService = async (userId: string, id: string): Promise<{ deleted: boolean }> => {
  const res = await ControlPageModel.deleteOne({ _id: id, userId }).exec();
  if (!res.deletedCount) throw new ErrorHandler(404, 'Page not found');
  return { deleted: true };
};
