import { config } from '../config';
import { Request, NextFunction, Response } from 'express';
import { IUser } from '../interfaces/user.interface';
import bcrypt from 'bcryptjs';
import ResponseHandler from './response-handler';
import ErrorHandler from './error-handler';
import jwt from 'jsonwebtoken';
import { userDao } from '../dao/user.dao';
import { redis } from './redis';
import { ERROR_CODES } from '../constants/error-codes';

interface ITokenOptions {
  maxAge: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'strict' | 'none' | 'lax' | undefined;
}

interface ISessionData {
  deviceInfo: {
    userAgent?: string;
    ipAddress?: string;
  };
}

export const generateUserRedisKey = (userId: unknown) => `KL:${userId}`;

const isProd = config.environment === 'production';

// Express cookie maxAge is in milliseconds; the JWT expiry config is in
// seconds. (Before: 604800 was read as ms, so cookies died after ~10 min.)
// No fixed `expires`: Express derives it from maxAge on every response.
export const accessTokenOptions: ITokenOptions = {
  maxAge: config.jwtAccessExpiresIn * 1000,
  httpOnly: isProd,
  secure: isProd, // only true in prod
  sameSite: isProd ? 'none' : 'lax', // ✅ use 'lax' in dev
  ...(isProd && { domain: '.pixxo.io' })
};

export const refreshTokenOptions: ITokenOptions = {
  maxAge: config.jwtRefreshExpiresIn * 1000,
  httpOnly: isProd,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  ...(isProd && { domain: '.pixxo.io' })
};

// Send the access token and refresh token as cookies
export const sendAuthToken = async (
  user: IUser,
  req: Request,
  res: Response,
  next: NextFunction,
  authProvider?: 'phone' | 'google',
  sendRes: boolean = true
) => {
  try {
    const accessToken = user.signAccessToken();
    const refreshToken = user.signRefreshToken();

    // Hash the refresh token using SHA-256 before saving it to the database
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    // save the hashed refresh token to the database
    user.refreshToken = hashedRefreshToken;
    // save device info to the database
    user.deviceInfo = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.get('do-connecting-ip') || req.ip
    };
    user.lastActivity = new Date();
    if (authProvider) user.$locals = { authProvider };
    await userDao.save(user);

    await redis.set(
      generateUserRedisKey(user._id),
      JSON.stringify(user),
      'PX',
      parseInt(config.cookieRefreshMaxAge)
    );

    res.cookie('accessToken', accessToken, accessTokenOptions);
    res.cookie('refreshToken', refreshToken, refreshTokenOptions);
    const { refreshToken: _, ...userDataWithoutToken } = user.toObject();
    if (sendRes) {
      return ResponseHandler.success(
        {
          user : userDataWithoutToken
        },
        'Login successful'
      ).send(res);
    }
    return { user };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Authentication error occurred';
    return next(
      new ErrorHandler({
        statusCode: 500,
        message: errorMessage,
        errorCode: 'ERROR'
      })
    );
  }
};

// Clear the access token and refresh token cookies
export const clearAuthTokens = async (
  user: IUser,
  req: Request,
  res: Response
) => {
  user.refreshToken = '';
  user.lastActivity = new Date();
  await userDao.save(user);

  req.user = null;
  await redis.del(generateUserRedisKey(user._id));

  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  ResponseHandler.success({}, 'User logged out successfully').send(res);
};

// Update the access token and refresh token cookies with new tokens when access token expires and refresh token is still valid
export const updateAuthTokens = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const incomingRefreshToken = req.cookies?.refreshToken;

    if (!incomingRefreshToken) {
      return next(new ErrorHandler(ERROR_CODES.USER_NOT_LOGGED_IN));
    }

    let decoded: IUser;
    try {
      decoded = jwt.verify(
        incomingRefreshToken,
        config.jwtRefreshSecret
      ) as IUser;
    } catch {
      return next(new ErrorHandler(ERROR_CODES.INVALID_TOKEN));
    }

    if (!decoded || !decoded._id) {
      return next(new ErrorHandler(ERROR_CODES.INVALID_TOKEN_PAYLOAD));
    }

    // check session in redis
    const session = await redis.get(generateUserRedisKey(decoded._id));

    if (!session) {
      return next(new ErrorHandler(ERROR_CODES.SESSION_NOT_FOUND));
    }

    const user = await userDao.findByIdWithRefreshToken(String(decoded._id));

    if (!user) {
      return next(new ErrorHandler(ERROR_CODES.USER_NOT_FOUND));
    }

    const isValid = await user.compareRefreshToken(incomingRefreshToken);

    // check if the refresh token in the database matches the provided token
    if (!isValid) {
      return next(new ErrorHandler(ERROR_CODES.SESSION_VALIDATION_ERROR));
    }
    // check if the user agent in the session matches the incoming request
    const sessionData = JSON.parse(session) as ISessionData;
    if (
      sessionData.deviceInfo?.userAgent &&
      req.headers['user-agent'] &&
      sessionData.deviceInfo.userAgent !== req.headers['user-agent']
    ) {
      return next(new ErrorHandler(ERROR_CODES.SESSION_VALIDATION_ERROR));
    }

    // update the access token and refresh token
    const refreshToken = user.signRefreshToken();
    const accessToken = user.signAccessToken();

    // Hash the refresh token using SHA-256 before saving it to the database
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    user.refreshToken = hashedRefreshToken;
    user.lastActivity = new Date();

    // upload session to redis
    const result = await redis.set(
      generateUserRedisKey(user._id),
      JSON.stringify(user),
      'PX',
      parseInt(config.cookieRefreshMaxAge)
    );

    if (result !== 'OK') {
      return next(new ErrorHandler(ERROR_CODES.REDIS_ERROR));
    }

    // save the hashed refresh token to the database
    await userDao.save(user);
    const { refreshToken: _, ...userDataWithoutToken } = user.toObject();
    res.cookie('accessToken', accessToken, accessTokenOptions);
    res.cookie('refreshToken', refreshToken, refreshTokenOptions);
    ResponseHandler.success(
      { userDataWithoutToken },
      'Tokens refreshed successfully'
    ).send(res);
  } catch (err) {
    throw new ErrorHandler({
      statusCode: 500,
      message: 'Internal Server Error',
      errorCode: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Token Revocation function to clear the refresh token from the database and redis
export const revokeToken = async (user: IUser, req: Request, res: Response) => {
  user.refreshToken = '';
  user.lastActivity = new Date();
  await userDao.save(user);

  req.user = null;

  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');
  ResponseHandler.success({}, 'Token revoked successfully').send(res);
};
