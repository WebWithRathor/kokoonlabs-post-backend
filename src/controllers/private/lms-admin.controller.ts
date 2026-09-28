import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import * as Admin from '../../services/private/lms-admin.service';

const id = (req: Request, key = 'id') => String(req.params[key]);

export const getCourseTree = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Admin.getCourseTree(id(req, 'courseId')), 'Course tree fetched successfully').send(res);
});

export const recalculateCourse = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Admin.recalculateCourse(id(req, 'courseId')), 'Course totals recalculated').send(res);
});

export const createModule = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.created(await Admin.createModule(req.body), 'Module created successfully').send(res);
});

export const updateModule = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Admin.updateModule(id(req), req.body), 'Module updated successfully').send(res);
});

export const createSubModule = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.created(await Admin.createSubModule(req.body), 'Sub-module created successfully').send(res);
});

export const updateSubModule = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Admin.updateSubModule(id(req), req.body), 'Sub-module updated successfully').send(res);
});

export const addContent = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.created(await Admin.addContent(id(req), req.body), 'Content added successfully').send(res);
});

export const updateContent = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Admin.updateContent(id(req, 'linkId'), req.body), 'Content updated successfully').send(res);
});

export const removeContent = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Admin.removeContent(id(req, 'linkId')), 'Content removed successfully').send(res);
});

export const listSkills = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Admin.listSkills(), 'Skills fetched successfully').send(res);
});

export const createSkill = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.created(await Admin.createSkill(req.body), 'Skill created successfully').send(res);
});

export const updateSkill = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Admin.updateSkill(id(req), req.body), 'Skill updated successfully').send(res);
});

export const listBadges = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Admin.listBadges(), 'Badges fetched successfully').send(res);
});

export const createBadge = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.created(await Admin.createBadge(req.body), 'Badge created successfully').send(res);
});

export const updateBadge = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  ResponseHandler.success(await Admin.updateBadge(id(req), req.body), 'Badge updated successfully').send(res);
});
