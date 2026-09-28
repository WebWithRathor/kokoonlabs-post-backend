import mongoose from 'mongoose';
import BlockModel from '../models/block.model';
import { IBlock, pagination } from '../interfaces';
import { searchRegex } from '../utils/regex';

export class BlockDao {
  async create(data: Partial<IBlock>): Promise<IBlock> {
    return await BlockModel.create(data);
  }

  async findById(id: string): Promise<IBlock | null> {
    return await BlockModel.findById(id).exec();
  }

  async findByType(type: string): Promise<IBlock | null> {
    return await BlockModel.findOne({ type }).exec();
  }

  async findByIdOrType(idOrType: string): Promise<IBlock | null> {
    const isObjectId = mongoose.Types.ObjectId.isValid(idOrType);
    if (isObjectId) {
      const block = await BlockModel.findById(idOrType).exec();
      if (block) return block;
    }
    return await BlockModel.findOne({ type: idOrType }).exec();
  }

  async list(
    filter: Record<string, any> = {},
    options: {
      page?: number;
      limit?: number;
      skip?: number;
      sort?: Record<string, 1 | -1>;
    } = {}
  ): Promise<{
    blocks: IBlock[];
    pagination: pagination;
  }> {
    const page = options.page || 1;
    const limit = options.limit || 0;
    const skip = options.skip !== undefined ? options.skip : (page - 1) * limit;
    const sort = options.sort || { createdAt: -1 };

    const queryFilter: Record<string, any> = { ...filter };

    if (queryFilter.search) {
      const regex = searchRegex(queryFilter.search);
      queryFilter.$or = [
        { type: regex },
        { label: regex },
        { title: regex },
        { category: regex }
      ];
      delete queryFilter.search;
    }

    const [blocks, total] = await Promise.all([
      BlockModel.find(queryFilter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      BlockModel.countDocuments(queryFilter).exec()
    ]);

    return {
      blocks,
      pagination: {
        currentPage: page,
        total,
        // limit 0 = no limit: everything is on one page
        limit: limit > 0 ? limit : total,
        totalPages: limit > 0 ? Math.ceil(total / limit) : total > 0 ? 1 : 0
      }
    };
  }

  async update(id: string, data: Partial<IBlock>): Promise<IBlock | null> {
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    if (isObjectId) {
      const updated = await BlockModel.findByIdAndUpdate(id, data, {
        new: true,
        runValidators: true
      }).exec();
      if (updated) return updated;
    }
    return await BlockModel.findOneAndUpdate({ type: id }, data, {
      new: true,
      runValidators: true
    }).exec();
  }

  async delete(id: string): Promise<IBlock | null> {
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    if (isObjectId) {
      const deleted = await BlockModel.findByIdAndDelete(id).exec();
      if (deleted) return deleted;
    }
    return await BlockModel.findOneAndDelete({ type: id }).exec();
  }
}

export default new BlockDao();
