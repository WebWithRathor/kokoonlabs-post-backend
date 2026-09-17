import BlockDao from '../../dao/block.dao';
import { IBlock, pagination } from '../../interfaces';
import ErrorHandler from '../../utils/error-handler';

export const listPublishedBlocksService = async (): Promise<{
  blocks: IBlock[];
  pagination: pagination;
}> => {
  const queryFilter: Record<string, any> = {
    status: 'published'
  };

  return await BlockDao.list(queryFilter);
};

export const getPublishedBlockService = async (
  idOrType: string
): Promise<IBlock> => {
  const block = await BlockDao.findByIdOrType(idOrType);
  if (!block || block.status !== 'published') {
    throw new ErrorHandler(404, `Block '${idOrType}' not found`);
  }
  return block;
};
