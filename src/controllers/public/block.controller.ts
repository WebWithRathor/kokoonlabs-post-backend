import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import {
  listPublishedBlocksService,
  getPublishedBlockService
} from '../../services/public/block.service';

export const listBlocks = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await listPublishedBlocksService();
    ResponseHandler.success(result, 'Blocks fetched successfully').send(res);
  }
);

export const getBlock = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const idOrType = req.params.idOrType as string;
    const block = await getPublishedBlockService(idOrType);
    ResponseHandler.success(block, 'Block fetched successfully').send(res);
  }
);
