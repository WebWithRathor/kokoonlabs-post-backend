import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import ErrorHandler from '../../utils/error-handler';
import { ERROR_CODES } from '../../constants/error-codes';
import { IotBoardType } from '../../utils/iot-studio';
import {
  boardStatusService,
  createBoardService,
  getIotConfigService,
  listBoardsService,
  prepareFlashService,
  removeBoardService,
  renameBoardService,
  resetBoardService,
  ssoTokenService
} from '../../services/public/iot-studio.service';

// Only the logged-in user from the session, never an id from the client
const getUserId = (req: Request): string => {
  if (!req.user?._id) throw new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN);
  return String(req.user._id);
};

export const getIotConfig = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(getIotConfigService()).send(res);
});

export const listBoards = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success({ boards: await listBoardsService(getUserId(req)) }).send(res);
});

export const createBoard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const board = await createBoardService(getUserId(req), { name: String(req.body.name), board: req.body.board as IotBoardType });
  ResponseHandler.created(board, 'Board added').send(res);
});

export const renameBoard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.updated(await renameBoardService(getUserId(req), String(req.params.id), String(req.body.name)), 'Board renamed').send(res);
});

export const removeBoard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await removeBoardService(getUserId(req), String(req.params.id)), 'Board removed').send(res);
});

export const boardStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await boardStatusService(getUserId(req), String(req.params.id))).send(res);
});

export const resetBoard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await resetBoardService(getUserId(req), String(req.params.id)), 'Connection reset').send(res);
});

export const prepareFlash = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const result = await prepareFlashService(getUserId(req), String(req.params.id), {
    programId: String(req.body.programId),
    version: String(req.body.version),
    variables: req.body.variables
  });
  // Holds the board's MQTT password: never cache it
  res.set('Cache-Control', 'no-store');
  ResponseHandler.success(result).send(res);
});

export const ssoToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  res.set('Cache-Control', 'no-store');
  ResponseHandler.success(await ssoTokenService(getUserId(req), req.body?.next)).send(res);
});
