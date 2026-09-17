import Kit from '../models/kit.model';
import { IKit, pagination } from '../interfaces';

export class KitDao {
  async listActiveKits(
    filter: Record<string, any> = {},
    options: { page?: number; perPage?: number } = {}
  ): Promise<{ kits: IKit[]; pagination: pagination }> {
    const page = options.page || 1;
    const limit = options.perPage || 20;
    const skip = (page - 1) * limit;

    const queryFilter = { ...filter, isActive: true };

    const [kits, total] = await Promise.all([
      Kit.find(queryFilter).skip(skip).limit(limit).exec(),
      Kit.countDocuments(queryFilter).exec()
    ]);

    return {
      kits,
      pagination: {
        currentPage: page,
        total,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async findBySlug(slug: string): Promise<IKit | null> {
    return await Kit.findOne({ slug, isActive: true }).exec();
  }

  async findById(id: string): Promise<IKit | null> {
    return await Kit.findById(id).exec();
  }

  async create(data: Partial<IKit>): Promise<IKit> {
    return await Kit.create(data);
  }

  async update(id: string, data: Partial<IKit>): Promise<IKit | null> {
    return await Kit.findByIdAndUpdate(id, data, { new: true }).exec();
  }
  
}

export default new KitDao();
