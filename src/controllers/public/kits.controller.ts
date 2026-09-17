import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import { listKitsService, getKitBySlugService } from '../../services/public/kits.service';

export const listKits = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const pagination = req.pagination || { page: 1, limit: 20, skip: 0 };
    const { filter = {} } = req.dbQuery || {};

    const result = await listKitsService({
      pagination,
      filter
    });

    ResponseHandler.success(result, 'Kits fetched successfully').send(res);
  }
);

export const getKitBySlug = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const slug = req.params.slug as string;
    const kit = await getKitBySlugService(slug);
    ResponseHandler.success(kit, 'Kit fetched successfully').send(res);
  }
);
