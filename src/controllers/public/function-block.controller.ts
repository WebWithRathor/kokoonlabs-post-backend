import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import ErrorHandler from '../../utils/error-handler';
import { ERROR_CODES } from '../../constants/error-codes';
import * as Fn from '../../services/public/function-block.service';

const author = (req: Request): Fn.Author => {
  if (!req.user?._id) throw new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN);
  const name = [req.user.name?.firstName, req.user.name?.lastName].filter(Boolean).join(' ') || 'Student';
  return { id: String(req.user._id), name };
};
const id = (req: Request) => String(req.params.id);
const pageOf = (req: Request) => req.pagination || { page: 1, limit: 20, skip: 0 };

export const listMine = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Fn.listMine(author(req).id), 'Your functions fetched').send(res);
});

export const listCommunity = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const search = req.query.search ? String(req.query.search) : undefined;
  ResponseHandler.success(await Fn.listCommunity(author(req).id, search, pageOf(req)), 'Community functions fetched').send(res);
});

export const getOne = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Fn.getOne(author(req).id, id(req)), 'Function fetched').send(res);
});

export const create = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.created(await Fn.create(author(req), req.body), 'Function saved').send(res);
});

export const update = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Fn.update(author(req).id, id(req), req.body), 'Function updated').send(res);
});

export const remove = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Fn.remove(author(req).id, id(req)), 'Function deleted').send(res);
});

export const requestPublish = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Fn.requestPublish(author(req).id, id(req)), 'Sent to an admin for review').send(res);
});

export const withdraw = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Fn.withdraw(author(req).id, id(req)), 'Publish request withdrawn').send(res);
});
