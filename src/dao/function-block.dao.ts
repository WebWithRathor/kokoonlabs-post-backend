import { Types } from 'mongoose';
import FunctionBlock from '../models/function-block.model';
import { FunctionBlockStatus, IFunctionBlock } from '../interfaces/function-block.interface';

type Id = Types.ObjectId | string;

// Lists skip the graph (it can be large); open one block to get it
const LIST_FIELDS = '-graph';
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class FunctionBlockDao {
  async create(data: Partial<IFunctionBlock>) {
    return (await FunctionBlock.create(data)).toObject();
  }

  async findById(id: Id) {
    if (!Types.ObjectId.isValid(String(id))) return null;
    return await FunctionBlock.findById(id);
  }

  async findLean(id: Id) {
    if (!Types.ObjectId.isValid(String(id))) return null;
    return await FunctionBlock.findById(id).populate('reviewedBy', 'name').lean<IFunctionBlock>();
  }

  // Published blocks belong to the community: they leave the author's list
  async listMine(owner: Id) {
    return await FunctionBlock.find({ owner, status: { $ne: 'published' } }).select(LIST_FIELDS).sort({ updatedAt: -1 }).limit(200).lean<IFunctionBlock[]>();
  }

  async list(filter: { status?: FunctionBlockStatus; search?: string }, skip: number, limit: number) {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.search) {
      const rx = new RegExp(escapeRegex(filter.search), 'i');
      query.$or = [{ title: rx }, { name: rx }, { description: rx }, { authorName: rx }];
    }
    const sort: Record<string, 1 | -1> = filter.status === 'pending' ? { submittedAt: 1 } : { updatedAt: -1 };
    const [items, total] = await Promise.all([
      FunctionBlock.find(query).select(LIST_FIELDS).sort(sort).skip(skip).limit(limit).lean<IFunctionBlock[]>(),
      FunctionBlock.countDocuments(query)
    ]);
    return { items, total };
  }

  async countByStatus() {
    const rows = await FunctionBlock.aggregate<{ _id: FunctionBlockStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    return Object.fromEntries(rows.map(r => [r._id, r.count])) as Partial<Record<FunctionBlockStatus, number>>;
  }

  async deleteOwned(id: Id, owner: Id) {
    const res = await FunctionBlock.deleteOne({ _id: id, owner, status: { $ne: 'published' } });
    return res.deletedCount === 1;
  }

  // Admin only: any status
  async deleteById(id: Id) {
    if (!Types.ObjectId.isValid(String(id))) return null;
    return await FunctionBlock.findByIdAndDelete(id).lean<IFunctionBlock>();
  }
}

export default new FunctionBlockDao();
