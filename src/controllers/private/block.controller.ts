import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import {
  createBlockService,
  listBlocksService,
  getBlockByIdOrTypeService,
  updateBlockService,
  deleteBlockService
} from '../../services/private/block.service';

export const createBlock = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const block = await createBlockService(req.body);
    ResponseHandler.created(block, 'Block created successfully').send(res);
  }
);

export const listBlocks = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const pagination = req.pagination || { page: 1, limit: 20, skip: 0 };
    const { filter = {}, sort } = req.dbQuery || {};

    const result = await listBlocksService({
      pagination,
      filter,
      sort
    });

    ResponseHandler.success(result, 'Blocks fetched successfully').send(res);
  }
);

export const getBlock = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const block = await getBlockByIdOrTypeService(id);
    ResponseHandler.success(block, 'Block fetched successfully').send(res);
  }
);

export const updateBlock = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const block = await updateBlockService(id, req.body);
    ResponseHandler.success(block, 'Block updated successfully').send(res);
  }
);

export const deleteBlock = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const block = await deleteBlockService(id);
    ResponseHandler.success(block, 'Block deleted successfully').send(res);
  }
);
