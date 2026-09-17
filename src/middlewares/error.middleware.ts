import { config } from '../config/config';
import ErrorHandler from '../utils/error-handler';
import { NextFunction, Request, Response } from 'express';
import errorLogDao from '../dao/error-log.dao';
import logger from '../config/logger';

import {
  MongooseValidationError,
  MongooseDuplicateKeyError,
  MongooseCastError
} from '../interfaces/error.interface';

// Type guard functions
function isValidationError(err: unknown): err is MongooseValidationError {
  return (
    (err as Error).name === 'ValidationError' &&
    typeof (err as MongooseValidationError).errors === 'object'
  );
}

function isDuplicateKeyError(err: unknown): err is MongooseDuplicateKeyError {
  return (
    (err as MongooseDuplicateKeyError).code === 11000 &&
    typeof (err as MongooseDuplicateKeyError).keyValue === 'object'
  );
}

function isCastError(err: unknown): err is MongooseCastError {
  return (
    (err as Error).name === 'CastError' &&
    typeof (err as MongooseCastError).path === 'string'
  );
}

function isExpiredAccessTokenError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message === 'EXPIRED_ACCESS_TOKEN' ||
      err.name === 'TokenExpiredError')
  );
}

function isUserNotLoggedInError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.message === 'Please login to access this resource' ||
      err.message.includes('Session validation failed'))
  );
}

const errorMiddleware = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  let customError: ErrorHandler;
  let errorCode: string | undefined; // for production error messages

  if (isExpiredAccessTokenError(err)) {
    errorCode = 'EXPIRED_ACCESS_TOKEN';
    customError = new ErrorHandler(401, 'EXPIRED_ACCESS_TOKEN');
  } else if (isUserNotLoggedInError(err)) {
    errorCode = 'USER_NOT_LOGGED_IN';
    customError = new ErrorHandler(401, 'Please login to access this resource');
  } else if (isCastError(err)) {
    const message = `Resource not found. Invalid: ${err.path}`;
    errorCode = 'RESOURCE_NOT_FOUND';
    customError = new ErrorHandler(404, message);
  } else if (isDuplicateKeyError(err)) {
    const keys = Object.keys(err.keyValue).join(', ');
    const message = `Duplicate ${keys} entered`;
    errorCode = 'DUPLICATE_KEY';
    customError = new ErrorHandler(400, message);
  }
  // mongoose validation error
  else if (isValidationError(err)) {
    const message = Object.values(err.errors)
      .map(value => value.message)
      .join(', ');
    errorCode = 'VALIDATION_ERROR';
    customError = new ErrorHandler(400, message);
  }
  // JWT token error
  else if (err instanceof Error && err.name === 'JsonWebTokenError') {
    const message = 'Invalid token. Please login again';
    errorCode = 'INVALID_TOKEN';
    customError = new ErrorHandler(401, message);
  }
  // JWT token expired error
  else if (err instanceof Error && err.name === 'TokenExpiredError') {
    const message = 'Token expired. Please login again';
    errorCode = 'TOKEN_EXPIRED';
    customError = new ErrorHandler(401, message);
  }
  // If the error is not one of the above, preserve the error with its status code
  else {
    // Check if it's already an ErrorHandler with a status code
    const errorHandler = err as ErrorHandler;
    if (errorHandler.statusCode && errorHandler.statusCode < 500) {
      // Preserve 4xx errors (like 404 "User not found")
      customError = errorHandler;
    } else {
      // For 5xx or unknown errors
      customError =
        config.environment === 'production'
          ? new ErrorHandler(500)
          : (err as ErrorHandler);
    }
  }
  // Log the error for development purposes only
  const statusCode = customError.statusCode || 500;

  // Save 500 errors to database
  if (statusCode >= 500) {
    logger.error('Error occurred:', err);
    if (config.environment === 'production') {
      try {
        const errorLogData = {
          message: customError.message,
          stack: err instanceof Error ? err.stack : 'No stack trace available',
          statusCode: statusCode,
          url: req.originalUrl,
          method: req.method,
          requestBody: req.body as object,
          requestParams: req.params as object,
          requestQuery: req.query,
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          user: req.user ? req.user._id : undefined
        };

        // Save asynchronously using the DAO
        errorLogDao.create(errorLogData).catch((saveErr: unknown) => {
          logger.error('Failed to save error log', { error: saveErr });
        });
      } catch (logError) {
        logger.error('Error while logging error to database', {
          error: logError
        });
      }
    }
  }

  // In production, only hide detailed error messages for server errors (5xx)
  // Show meaningful messages for client errors (4xx) like "User not found"
  if (config.environment === 'production' && statusCode >= 500) {
    customError.message = `Oops! Something unexpected happened on our end. We're on it! Please try again in a few minutes.`;
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    code: errorCode,
    message: customError.message
  });
};

export default errorMiddleware;
