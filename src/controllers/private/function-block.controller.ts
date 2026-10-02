import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import ErrorHandler from '../../utils/error-handler';
import { ERROR_CODES } from '../../constants/error-codes';
import { FunctionBlockStatus } from '../../interfaces/function-block.interface';
import * as Review from '../../services/private/function-block-review.service';

const adminId = (req: Request) => {
  if (!req.user?._id) throw new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN);
  return String(req.user._id);
};

export const list = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await Review.list(
    {
      status: (req.query.status as FunctionBlockStatus) || 'pending',
      search: req.query.search ? String(req.query.search) : undefined
    },
    req.pagination || { page: 1, limit: 20, skip: 0 }
  );
  ResponseHandler.success(result, 'Function blocks fetched').send(res);
});

export const getOne = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Review.getOne(String(req.params.id)), 'Function block fetched').send(res);
});

export const approve = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await Review.approve(adminId(req), String(req.params.id), req.body?.note);
  ResponseHandler.success(result, 'Published for every student').send(res);
});

export const reject = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await Review.reject(adminId(req), String(req.params.id), String(req.body.note));
  ResponseHandler.success(result, 'Sent back to the student').send(res);
});

export const remove = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Review.remove(String(req.params.id)), 'Function block deleted').send(res);
});
