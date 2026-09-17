import BlockDao from '../../dao/block.dao';
import { IBlock, pagination } from '../../interfaces';
import ErrorHandler from '../../utils/error-handler';

export const createBlockService = async (
  data: Partial<IBlock>
): Promise<IBlock> => {
  if (data.type) {
    const existing = await BlockDao.findByType(data.type);
    if (existing) {
      throw new ErrorHandler(409, `Block with type '${data.type}' already exists`);
    }
  }

  return await BlockDao.create(data);
};

export const listBlocksService = async ({
  pagination: paginationParams,
  filter = {},
  sort
}: {
  pagination: { page: number; limit: number; skip: number };
  filter?: Record<string, any>;
  sort?: Record<string, 1 | -1>;
}): Promise<{
  blocks: IBlock[];
  pagination: pagination;
}> => {
  return await BlockDao.list(filter, {
    page: paginationParams.page,
    limit: paginationParams.limit,
    skip: paginationParams.skip,
    sort
  });
};

export const getBlockByIdOrTypeService = async (
  idOrType: string
): Promise<IBlock> => {
  const block = await BlockDao.findByIdOrType(idOrType);
  if (!block) {
    throw new ErrorHandler(404, `Block '${idOrType}' not found`);
  }
  return block;
};

export const updateBlockService = async (
  idOrType: string,
  data: Partial<IBlock>
): Promise<IBlock> => {
  // If changing type, ensure uniqueness
  if (data.type) {
    const existing = await BlockDao.findByType(data.type);
    if (existing && existing._id.toString() !== idOrType && existing.type !== idOrType) {
      throw new ErrorHandler(409, `Block with type '${data.type}' already exists`);
    }
  }

  const updated = await BlockDao.update(idOrType, data);
  if (!updated) {
    throw new ErrorHandler(404, `Block '${idOrType}' not found`);
  }
  return updated;
};

export const deleteBlockService = async (
  idOrType: string
): Promise<IBlock> => {
  const deleted = await BlockDao.delete(idOrType);
  if (!deleted) {
    throw new ErrorHandler(404, `Block '${idOrType}' not found`);
  }
  return deleted;
};
