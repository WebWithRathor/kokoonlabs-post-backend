import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import { getBtPage } from '../../services/public/bt-page.service';

export const getBtPageController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await getBtPage(String(req.params.code));
    ResponseHandler.success(result, 'Bluetooth page fetched successfully').send(res);
  }
);
