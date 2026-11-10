import { Request, Response } from 'express';
import asyncHandler from '../../utils/async-handler';
import ResponseHandler from '../../utils/response-handler';
import {
  deleteComponent,
  importComponents,
  linkBlock,
  listComponents,
  saveComponent,
  unlinkBlock
} from '../../services/private/component.service';

const userIdOf = (req: Request) => String((req.user as { _id?: unknown } | undefined)?._id ?? '');
const keyOf = (req: Request) => String(req.params.key ?? '').trim().toLowerCase();

export const listAllComponents = asyncHandler(async (_req: Request, res: Response) => {
  ResponseHandler.success({ components: await listComponents() }, 'Components').send(res);
});

export const createComponent = asyncHandler(async (req: Request, res: Response) => {
  const key = String(req.body?.key ?? '').trim().toLowerCase();
  ResponseHandler.created(await saveComponent(key, req.body, userIdOf(req), true), 'Component added').send(res);
});

export const updateComponent = asyncHandler(async (req: Request, res: Response) => {
  ResponseHandler.success(await saveComponent(keyOf(req), req.body, userIdOf(req), false), 'Component saved').send(res);
});

export const removeComponent = asyncHandler(async (req: Request, res: Response) => {
  await deleteComponent(keyOf(req));
  ResponseHandler.success({}, 'Component removed').send(res);
});

/** Adds the components that are not there yet (set up from the blocks). */
export const importAllComponents = asyncHandler(async (req: Request, res: Response) => {
  const list = Array.isArray(req.body?.components) ? req.body.components : [];
  ResponseHandler.success(await importComponents(list, userIdOf(req)), 'Imported').send(res);
});

/** The block editor: this block is for that component. */
export const linkBlockToComponent = asyncHandler(async (req: Request, res: Response) => {
  const links = Array.isArray(req.body?.links) ? req.body.links : [];
  ResponseHandler.success(await linkBlock(keyOf(req), String(req.params.blockType), links, userIdOf(req)), 'Linked').send(res);
});

/** The block is not a physical part (or was deleted): drop its links. */
export const unlinkBlockEverywhere = asyncHandler(async (req: Request, res: Response) => {
  await unlinkBlock(String(req.params.blockType), userIdOf(req));
  ResponseHandler.success({}, 'Unlinked').send(res);
});
