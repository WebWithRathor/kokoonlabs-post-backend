import { Request, Response } from 'express';
import asyncHandler from '../../utils/async-handler';
import ResponseHandler from '../../utils/response-handler';
import { analyzeBlock, deleteProfile, getProfiles, saveProfile, teachBlock } from '../../services/private/ai-profile.service';

const typeParam = (req: Request) => String(req.params.type ?? '');

export const listAiProfiles = asyncHandler(async (_req: Request, res: Response) => {
  ResponseHandler.success({ profiles: await getProfiles() }, 'AI block profiles').send(res);
});

/** Claude's proposal for a block (not saved). */
export const analyzeAiProfile = asyncHandler(async (req: Request, res: Response) => {
  ResponseHandler.success(await analyzeBlock(typeParam(req)), 'Proposal ready').send(res);
});

export const saveAiProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = String((req.user as { _id?: unknown } | undefined)?._id ?? '');
  ResponseHandler.success(await saveProfile(typeParam(req), req.body, userId), 'Saved').send(res);
});

/** Claude reads the block and the profile is saved if it passes the checks. */
export const teachAiProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = String((req.user as { _id?: unknown } | undefined)?._id ?? '');
  ResponseHandler.success(await teachBlock(typeParam(req), userId), 'Taught').send(res);
});

export const deleteAiProfile = asyncHandler(async (req: Request, res: Response) => {
  await deleteProfile(typeParam(req));
  ResponseHandler.success({}, 'Removed').send(res);
});
