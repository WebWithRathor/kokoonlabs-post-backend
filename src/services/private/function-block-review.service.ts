import { Types } from 'mongoose';
import FunctionBlockDao from '../../dao/function-block.dao';
import LmsRewardsDao from '../../dao/lms-rewards.dao';
import ErrorHandler from '../../utils/error-handler';
import { FunctionBlockStatus } from '../../interfaces/function-block.interface';

type Id = Types.ObjectId | string;

export const list = async (
  filter: { status?: FunctionBlockStatus; search?: string },
  page: { page: number; limit: number; skip: number }
) => {
  const [{ items, total }, counts] = await Promise.all([
    FunctionBlockDao.list(filter, page.skip, page.limit),
    FunctionBlockDao.countByStatus()
  ]);
  return {
    functions: items,
    counts,
    pagination: { currentPage: page.page, total, limit: page.limit, totalPages: Math.max(1, Math.ceil(total / page.limit)) }
  };
};

export const getOne = async (id: string) => {
  const block = await FunctionBlockDao.findLean(id);
  if (!block) throw new ErrorHandler(404, 'Function block not found');
  return block;
};

const notifyOwner = (owner: Id, blockId: string, title: string, published: boolean, note?: string) =>
  LmsRewardsDao.notifyOnce([
    {
      user: new Types.ObjectId(String(owner)),
      type: 'function_block_reviewed',
      title: published ? `Your block "${title}" is published for everyone` : `Your block "${title}" needs changes`,
      body: note || undefined,
      data: { functionBlockId: blockId, status: published ? 'published' : 'rejected' },
      link: '/editor',
      dedupeKey: `fnblock:${blockId}:${Date.now()}`
    }
  ]);

export const approve = async (adminId: Id, id: string, note?: string) => {
  const block = await FunctionBlockDao.findById(id);
  if (!block) throw new ErrorHandler(404, 'Function block not found');
  if (block.status !== 'pending') throw new ErrorHandler(409, 'Only blocks waiting for review can be approved');
  block.set({ status: 'published', reviewNote: note ?? '', reviewedBy: new Types.ObjectId(String(adminId)), reviewedAt: new Date() });
  await block.save();
  await notifyOwner(block.owner, id, block.title, true, note);
  return block.toObject();
};

// Send a request back, or take a published block off the community list
export const reject = async (adminId: Id, id: string, note: string) => {
  const block = await FunctionBlockDao.findById(id);
  if (!block) throw new ErrorHandler(404, 'Function block not found');
  if (block.status !== 'pending' && block.status !== 'published') {
    throw new ErrorHandler(409, 'Only waiting or published blocks can be sent back');
  }
  block.set({ status: 'rejected', reviewNote: note, reviewedBy: new Types.ObjectId(String(adminId)), reviewedAt: new Date() });
  await block.save();
  await notifyOwner(block.owner, id, block.title, false, note);
  return block.toObject();
};

// Admins are the only ones who can delete a published block. Projects that
// already use it keep their own copy.
export const remove = async (id: string) => {
  const block = await FunctionBlockDao.deleteById(id);
  if (!block) throw new ErrorHandler(404, 'Function block not found');
  if (block.status === 'published') {
    await LmsRewardsDao.notifyOnce([
      {
        user: new Types.ObjectId(String(block.owner)),
        type: 'function_block_reviewed',
        title: `Your block "${block.title}" was removed from Community blocks by an admin`,
        data: { functionBlockId: id, status: 'deleted' },
        link: '/editor',
        dedupeKey: `fnblock:${id}:deleted`
      }
    ]);
  }
  return { deleted: true };
};
