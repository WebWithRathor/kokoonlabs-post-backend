import { Request, Response, NextFunction } from 'express';
import ErrorHandler from '../utils/error-handler';
import asyncHandler from '../utils/async-handler';
import { redis } from '../utils/redis';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import bcrypt from 'bcryptjs';
import { IUser, RoleHierarchy, UserRole } from '../interfaces/user.interface';
import ResponseHandler from '../utils/response-handler';
import { generateUserRedisKey } from '../utils/auth.util';
import { ERROR_CODES } from '../constants/error-codes';

export const isAuthenticated = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const accessToken = req.cookies.accessToken as string;
    const incomingRefreshToken = req.cookies.refreshToken as string;
    if (!accessToken || !incomingRefreshToken) {
      return ResponseHandler.success(
        {
          user: null,
          errorCode: ERROR_CODES.INVALID_TOKEN.errorCode
        },
        ERROR_CODES.INVALID_TOKEN.message
      ).send(res);
    }

    let decoded: IUser;
    try {
      decoded = jwt.verify(accessToken, config.jwtAccessSecret) as IUser;
    } catch {
      return next(new ErrorHandler(ERROR_CODES.INVALID_TOKEN));
    }

    if (!decoded || !decoded._id) {
      return next(new ErrorHandler(ERROR_CODES.INVALID_TOKEN_PAYLOAD));
    }

    const userKey = generateUserRedisKey(decoded._id);
    const user = await redis.get(userKey);

    if (!user) {
      return next(new ErrorHandler(ERROR_CODES.SESSION_NOT_FOUND));
    }

    const userData = JSON.parse(user) as IUser;
    const { refreshToken, password, ...userDataWithoutToken } = userData;
    const isValid = await bcrypt.compare(
      incomingRefreshToken,
      refreshToken as string
    );

    if (
      !isValid ||
      userData.deviceInfo.userAgent !== req.headers['user-agent']
    ) {
      return next(new ErrorHandler(ERROR_CODES.SESSION_VALIDATION_ERROR));
    }

    if (userData.isActive === false) {
      const urlPath = req.originalUrl.split('?')[0];
      if (urlPath.endsWith('/users/me') || urlPath.endsWith('/me')) {
        req.user = userDataWithoutToken as IUser;
        return next();
      }
      if (urlPath.endsWith('/auth/logout')) {
        req.user = userDataWithoutToken as IUser;
        return next();
      }

      return ResponseHandler.success(
        {
          user: userDataWithoutToken,
          errorCode: ERROR_CODES.USER_NOT_ACTIVE.errorCode
        },
        ERROR_CODES.USER_NOT_ACTIVE.message
      ).send(res);
    }
    req.user = userDataWithoutToken as IUser;
    next();
  }
);

export const isAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  try {
    if (!req.user) {
      throw new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN);
    }

    if (req.user.role !== UserRole.ADMIN) {
      throw new ErrorHandler(ERROR_CODES.INVALID_ROLE);
    }

    next();
  } catch (err) {
    next(err);
  }
};

// Attaches the user if a valid token is present, but does not require one.
export const optionalAuthentication = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accessToken = req.cookies.accessToken as string;
      const incomingRefreshToken = req.cookies.refreshToken as string;

      if (!accessToken || !incomingRefreshToken) {
        return next();
      }

      const decoded = jwt.verify(accessToken, config.jwtAccessSecret) as IUser;

      if (!decoded || !decoded._id) {
        return next();
      }

      const user = await redis.get(generateUserRedisKey(decoded._id));
      if (!user) {
        return next();
      }
      const userData = JSON.parse(user) as IUser;
      const { refreshToken, ...userDataWithoutToken } = userData;

      const isValid = await bcrypt.compare(
        incomingRefreshToken,
        refreshToken as string
      );

      if (!isValid) {
        return next();
      }

      req.user = userDataWithoutToken as IUser;
      next();
    } catch (error) {
      console.error('Error occurred during optional authentication:', error);
      return next();
    }
  }
);

export const hasMinimumRoleLevel = (
  userRole: UserRole,
  minimumRole: UserRole | number
): boolean => {
  const minLevel =
    typeof minimumRole === 'number' ? minimumRole : RoleHierarchy[minimumRole];
  const userLevel = RoleHierarchy[userRole] ?? 0;
  return userLevel >= minLevel;
};

// Middleware factory for role-based access
export const requireRole = (minimumRole: UserRole | number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as IUser;

    if (!user) {
      return next(new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN));
    }

    if (user.role === UserRole.BLOCKED) {
      return next(
        new ErrorHandler({
          statusCode: 403,
          message: 'Your account is blocked',
          errorCode: 'ACCOUNT_BLOCKED'
        })
      );
    }

    if (user.role === UserRole.DELETED) {
      return next(
        new ErrorHandler({
          statusCode: 403,
          message: 'Your account is deleted',
          errorCode: 'ACCOUNT_DELETED'
        })
      );
    }

    if (!hasMinimumRoleLevel(user.role, minimumRole)) {
      return next(
        new ErrorHandler({
          statusCode: 403,
          message: 'You do not have sufficient permissions',
          errorCode: 'FORBIDDEN'
        })
      );
    }
    next();
  };
};

// Middleware factory for specific roles
export const requireSpecificRoles = (allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as IUser;

    if (!user) {
      return next(new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN));
    }

    if (user.role === UserRole.BLOCKED) {
      return next(
        new ErrorHandler({
          statusCode: 403,
          message: 'Your account is blocked',
          errorCode: 'ACCOUNT_BLOCKED'
        })
      );
    }

    if (user.role === UserRole.DELETED) {
      return next(
        new ErrorHandler({
          statusCode: 403,
          message: 'Your account is deleted',
          errorCode: 'ACCOUNT_DELETED'
        })
      );
    }

    if (!allowedRoles.includes(user.role)) {
      return next(
        new ErrorHandler({
          statusCode: 403,
          message: 'You do not have sufficient permissions',
          errorCode: 'FORBIDDEN'
        })
      );
    }
    next();
  };
};
