import { Request, Response, NextFunction } from 'express';
import ResponseHandler from '../../utils/response-handler';
import {
  sendAuthToken,
  clearAuthTokens,
  updateAuthTokens
} from '../../utils/auth.util';
import { IUser } from '../../interfaces';
import {
  registerService,
  loginWithPasswordService,
  resetPasswordWithOtpService,
  sendOtpService,
  loginWithOtpService,
  googleLoginService
} from '../../services/public/auth.service';
import userDao from '../../dao/user.dao';
import ErrorHandler from '../../utils/error-handler';
import { ERROR_CODES } from '../../constants/error-codes';
import asyncHandler from '../../utils/async-handler';

export const sendOtpLogin = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { phone } = req.body;
    const phoneData = {
      code: phone?.code,
      number: phone?.number || (phone as unknown as string)
    };
    if (phoneData.code !== '+91' && phoneData.code !== '91') {
      throw new ErrorHandler(ERROR_CODES.INVALID_PHONE_NUMBER);
    }
    const user = await userDao.findOne({ 'phone.number': phoneData.number });
    if (!user) {
      throw ResponseHandler.notFound('User not found');
    }
    const result = await sendOtpService(phoneData);
    ResponseHandler.success(result, 'OTP sent for login').send(res);
  }
);

export const loginWithOtp = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { phone, otp } = req.body;
    const phoneData = {
      code: phone?.code || '+91',
      number: phone?.number || phone
    };
    if (phoneData.code !== '+91' && phoneData.code !== '91') {
      throw new ErrorHandler(ERROR_CODES.INVALID_PHONE_NUMBER);
    }
    const user = await loginWithOtpService(phoneData, otp);
    await sendAuthToken(user, req, res, next, 'phone');
  }
);

export const sendOtpRegister = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { phone } = req.body;
    const phoneData = {
      code: phone?.code || '+91',
      number: phone?.number || phone
    };
    const user = await userDao.findOne({ 'phone.number': phoneData.number });
    if (user) {
      throw ResponseHandler.conflict('User already exists');
    }
    const result = await sendOtpService(phoneData, true);
    ResponseHandler.success(result, 'OTP sent for registration').send(res);
  }
);

export const register = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { name, phone, password, otp } = req.body;
    const phoneData = {
      code: phone?.code || '+91',
      number: phone?.number || phone
    };
    const user = await registerService({
      name,
      phone: phoneData,
      password,
      otp
    });
    await sendAuthToken(user, req, res, next, 'phone');
  }
);

export const loginWithPassword = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { phone, password } = req.body;
    const phoneData = {
      code: phone?.code || '+91',
      number: phone?.number || phone
    };
    const user = await loginWithPasswordService(phoneData, password);
    await sendAuthToken(user, req, res, next, 'phone');
  }
);

export const logout = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.user) {
      await clearAuthTokens(req.user as IUser, req, res);
    } else {
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      ResponseHandler.success(null, 'Logged out successfully').send(res);
    }
  }
);

export const refreshToken = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await updateAuthTokens(req, res, next);
  }
);

export const sendOtpResetPassword = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { phone } = req.body;
    const phoneData = {
      code: phone?.code || '+91',
      number: phone?.number || phone
    };
    if (phoneData.code !== '+91' && phoneData.code !== '91') {
      throw new ErrorHandler(ERROR_CODES.INVALID_PHONE_NUMBER);
    }
    const result = await sendOtpService(phoneData);
    ResponseHandler.success(result, 'OTP sent for password reset').send(res);
  }
);

export const resetPasswordWithOtp = asyncHandler(
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { phone, otp, newPassword } = req.body;
    const phoneData = {
      code: phone?.code || '+91',
      number: phone?.number || phone
    };
    if (phoneData.code !== '+91' && phoneData.code !== '91') {
      throw new ErrorHandler(ERROR_CODES.INVALID_PHONE_NUMBER);
    }
    const user = await resetPasswordWithOtpService(phoneData, otp, newPassword);
    await sendAuthToken(user, req, res, next);
  }
);

export const googleLogin = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const { token: idToken } = req.body as { token: string };
    if (!idToken) {
      return next(
        new ErrorHandler({ statusCode: 400, message: 'ID token is required' })
      );
    }
    const user = await googleLoginService(idToken, req?.user as IUser);
    if (user) {
      await sendAuthToken(user, req, res, next, 'google');
    }
  }
);
