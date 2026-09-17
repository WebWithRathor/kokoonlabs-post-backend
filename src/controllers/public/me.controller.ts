import { NextFunction, Request, Response } from 'express';
import ResponseHandler from '../../utils/response-handler';
import asyncHandler from '../../utils/async-handler';
import {
  getMeService,
  updateProfileService,
  linkGoogleService,
  unlinkGoogleService,
} from '../../services/public/me.service';
import { IUser, IUserProfileUpdate } from '../../interfaces';
import { sendAuthToken } from '../../utils/auth.util';

export const getMe = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await getMeService(req.user as IUser);
    ResponseHandler.success({ user }, 'User profile fetched successfully').send(
      res
    );
  }
);

export const updateProfile = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userdata = req.body as IUserProfileUpdate;
    const user = await updateProfileService(String((req.user as IUser)._id), userdata);
    await sendAuthToken(user.user, req, res, next, undefined, false);
    ResponseHandler.success(user.user, 'Profile updated successfully').send(
      res
    );
  }
);

export const linkGoogle = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { google_id_token } = req.body;
    const result = await linkGoogleService(req.user as IUser, google_id_token);
    ResponseHandler.success(result, 'Google account linked successfully').send(
      res
    );
  }
);

export const unlinkGoogle = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await unlinkGoogleService(req.user as IUser);
    ResponseHandler.success(
      result,
      'Google account unlinked successfully'
    ).send(res);
  }
);
