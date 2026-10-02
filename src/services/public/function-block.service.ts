import { Types } from 'mongoose';
import FunctionBlockDao from '../../dao/function-block.dao';
import ErrorHandler from '../../utils/error-handler';
import { IFunctionBlock, IFunctionBlockGraph } from '../../interfaces/function-block.interface';

type Id = Types.ObjectId | string;
export interface Author {
  id: string;
  name: string;
}

const MAX_NODES = 300;
const MAX_EDGES = 600;
const MAX_GRAPH_BYTES = 500 * 1024;

const notFound = () => new ErrorHandler(404, 'Function block not found');

const pick = <T extends object>(data: T, keys: string[]): Partial<T> => {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (data as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
};

const EDITABLE = ['name', 'title', 'description', 'params', 'isAsync', 'returnValue', 'graph', 'code'];

const checkGraph = (graph?: IFunctionBlockGraph) => {
  if (!graph) return;
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new ErrorHandler(400, 'graph needs nodes and edges');
  if (!graph.nodes.length) throw new ErrorHandler(400, 'The function has no blocks');
  if (graph.nodes.length > MAX_NODES || graph.edges.length > MAX_EDGES) {
    throw new ErrorHandler(400, `A function can have at most ${MAX_NODES} blocks`);
  }
  if (JSON.stringify(graph).length > MAX_GRAPH_BYTES) throw new ErrorHandler(400, 'This function is too big to save');
};

const isOwner = (block: { owner: unknown }, userId: Id) => String(block.owner) === String(userId);

// ---------------------------------------------------------------------
// Student library
// ---------------------------------------------------------------------
export const listMine = (userId: Id) => FunctionBlockDao.listMine(userId);

const withIsMine = <T extends { owner: unknown }>(block: T, userId: Id) => ({ ...block, isMine: isOwner(block, userId) });

export const listCommunity = async (
  userId: Id,
  search: string | undefined,
  page: { page: number; limit: number; skip: number }
) => {
  const { items, total } = await FunctionBlockDao.list({ status: 'published', search }, page.skip, page.limit);
  return {
    functions: items.map(f => withIsMine(f, userId)),
    pagination: { currentPage: page.page, total, limit: page.limit, totalPages: Math.max(1, Math.ceil(total / page.limit)) }
  };
};

// Your own blocks, or anyone's published one
export const getOne = async (userId: Id, id: string) => {
  const block = await FunctionBlockDao.findLean(id);
  if (!block || (!isOwner(block, userId) && block.status !== 'published')) throw notFound();
  return withIsMine(block, userId);
};

export const create = async (author: Author, data: Partial<IFunctionBlock> & { forkedFromId?: string }) => {
  checkGraph(data.graph);
  let forkedFrom: IFunctionBlock['forkedFrom'] = null;
  if (data.forkedFromId) {
    const source = await FunctionBlockDao.findLean(data.forkedFromId);
    // Only link to blocks the student could see; otherwise save without a link
    if (source && (source.status === 'published' || isOwner(source, author.id))) {
      forkedFrom = { id: source._id as Types.ObjectId, title: source.title, authorName: source.authorName };
    }
  }
  return FunctionBlockDao.create({
    ...pick(data, EDITABLE),
    owner: new Types.ObjectId(author.id),
    authorName: author.name,
    status: 'private',
    forkedFrom
  });
};

// Published blocks belong to every student: the author can't change or
// delete them (only an admin can). Saving changes makes a new block.
const PUBLISHED_LOCKED = 'This block is published, so it can no longer be changed or deleted. Save your changes as a new block instead.';

// Editing a submitted or rejected block takes it back to private: the
// changed version needs a new review before others see it.
export const update = async (userId: Id, id: string, data: Partial<IFunctionBlock>) => {
  const block = await FunctionBlockDao.findById(id);
  if (!block || !isOwner(block, userId)) throw notFound();
  if (block.status === 'published') throw new ErrorHandler(403, PUBLISHED_LOCKED);
  checkGraph(data.graph);
  block.set(pick(data, EDITABLE));
  if (block.status !== 'private') {
    block.status = 'private';
    block.submittedAt = null;
  }
  await block.save();
  return block.toObject();
};

export const remove = async (userId: Id, id: string) => {
  const block = await FunctionBlockDao.findById(id);
  if (!block || !isOwner(block, userId)) throw notFound();
  if (block.status === 'published') throw new ErrorHandler(403, 'Only an admin can delete a published block');
  if (!(await FunctionBlockDao.deleteOwned(id, userId))) throw notFound();
  return { deleted: true };
};

export const requestPublish = async (userId: Id, id: string) => {
  const block = await FunctionBlockDao.findById(id);
  if (!block || !isOwner(block, userId)) throw notFound();
  if (block.status === 'pending') throw new ErrorHandler(409, 'Already waiting for an admin to review it');
  if (block.status === 'published') throw new ErrorHandler(409, 'Already published');
  block.status = 'pending';
  block.submittedAt = new Date();
  block.reviewNote = '';
  await block.save();
  return block.toObject();
};

// Take a publish request back before it is reviewed
export const withdraw = async (userId: Id, id: string) => {
  const block = await FunctionBlockDao.findById(id);
  if (!block || !isOwner(block, userId)) throw notFound();
  if (block.status !== 'pending') throw new ErrorHandler(409, 'Only a waiting request can be withdrawn');
  block.status = 'private';
  block.submittedAt = null;
  await block.save();
  return block.toObject();
};
