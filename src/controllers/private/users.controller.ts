import { Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import {
  listUsersService,
  getUserByIdService,
  updateUserRoleService,
  blockUserService,
  unblockUserService,
  deleteUserService
} from '../../services/private/users.service';
import { IUser, UserRole } from '../../interfaces/user.interface';

export const listUsers = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const pagination = req.pagination || { page: 1, limit: 20, skip: 0 };
    const { filter = {} } = req.dbQuery || {};

    const result = await listUsersService({
      role: filter.role || (req.query.role as string),
      status: filter.status || (req.query.status as string),
      search: filter.search || (req.query.search as string),
      page: pagination.page,
      perPage: pagination.limit
    });

    ResponseHandler.success(result, 'Users fetched successfully').send(res);
  }
);

export const getUserById = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.params.userId as string;
    const user = await getUserByIdService(userId);
    ResponseHandler.success(user, 'User fetched successfully').send(res);
  }
);

export const updateUserRole = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.params.userId as string;
    const targetRole = req.body.role as UserRole;
    const actorUser = req.user as IUser;

    const updatedUser = await updateUserRoleService(
      actorUser,
      userId,
      targetRole
    );
    ResponseHandler.success(updatedUser, 'User role updated successfully').send(
      res
    );
  }
);

export const blockUser = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.params.userId as string;
    const blockedUser = await blockUserService(userId);
    ResponseHandler.success(blockedUser, 'User blocked successfully').send(res);
  }
);

export const unblockUser = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.params.userId as string;
    const unblockedUser = await unblockUserService(userId);
    ResponseHandler.success(unblockedUser, 'User unblocked successfully').send(
      res
    );
  }
);

export const deleteUser = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.params.userId as string;
    const deletedUser = await deleteUserService(userId);
    ResponseHandler.success(deletedUser, 'User deleted successfully').send(res);
  }
);
