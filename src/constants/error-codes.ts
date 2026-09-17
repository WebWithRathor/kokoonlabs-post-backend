export const ERROR_CODES = {
  // 400 - Bad Request
  DUPLICATE_KEY: {
    errorCode: 'DUPLICATE_KEY',
    statusCode: 400,
    message: 'Duplicate value entered.',
    customMessage: (keys: Record<string, unknown>) => {
      const keysString = Object.keys(keys).join(', ');
      return `Duplicate ${keysString} entered`;
    }
  },
  INVALID_PHONE_NUMBER: {
    errorCode: 'INVALID_PHONE_NUMBER',
    statusCode: 400,
    message: 'Invalid Indian phone number.'
  },
  USER_NOT_REGISTERED: {
    errorCode: 'USER_NOT_REGISTERED',
    statusCode: 404,
    message: 'User not registered.'
  },
  INVALID_REQUEST: {
    errorCode: 'INVALID_REQUEST',
    statusCode: 400,
    message: 'Invalid request.'
  },
  VALIDATION_ERROR: {
    errorCode: 'VALIDATION_ERROR',
    statusCode: 400,
    message: 'Validation failed.',
    customeMessage: (
      keyPair: Record<
        string,
        {
          message: string;
        }
      >
    ) => {
      const message = Object.values(keyPair)
        .map(value => value.message)
        .join(', ');
      return message;
    }
  },

  // 401 - Unauthorized
  EXPIRED_ACCESS_TOKEN: {
    errorCode: 'EXPIRED_ACCESS_TOKEN',
    statusCode: 401,
    message: 'Access token has expired.'
  },
  EXPIRED_TOKEN: {
    errorCode: 'EXPIRED_TOKEN',
    statusCode: 401,
    message: 'token has expired.'
  },
  INVALID_CREDENTIALS: {
    errorCode: 'INVALID_CREDENTIALS',
    statusCode: 401,
    message: 'Invalid phone number or password.'
  },
  INVALID_EXPIRED_OTP: {
    errorCode: 'INVALID_EXPIRED_OTP',
    statusCode: 401,
    message: 'Invalid or expired OTP.'
  },
  INVALID_TOKEN: {
    errorCode: 'INVALID_TOKEN',
    statusCode: 401,
    message: 'Invalid token.'
  },
  INVALID_TOKEN_PAYLOAD: {
    errorCode: 'INVALID_TOKEN_PAYLOAD',
    statusCode: 401,
    message: 'Invalid token payload.'
  },
  INVALID_TOKEN_SIGNATURE: {
    errorCode: 'INVALID_TOKEN_SIGNATURE',
    statusCode: 401,
    message: 'Invalid token signature.'
  },
  SESSION_NOT_FOUND: {
    errorCode: 'SESSION_NOT_FOUND',
    statusCode: 401,
    message: 'Session not found. Please login again.'
  },
  SESSION_VALIDATION_ERROR: {
    errorCode: 'SESSION_VALIDATION_ERROR',
    statusCode: 401,
    message: 'Session validation failed. Please login again.'
  },
  TOKEN_EXPIRED: {
    errorCode: 'TOKEN_EXPIRED',
    statusCode: 401,
    message: 'Token expired. Please login again.'
  },
  USER_NOT_LOGGED_IN: {
    errorCode: 'USER_NOT_LOGGED_IN',
    statusCode: 401,
    message: 'Please login to access this resource.'
  },

  // 403 - Forbidden
  ACCOUNT_NOT_VERIFIED: {
    errorCode: 'ACCOUNT_NOT_VERIFIED',
    statusCode: 403,
    message: 'Please verify your account.'
  },
  INVALID_ROLE: {
    errorCode: 'INVALID_ROLE',
    statusCode: 403,
    message: 'You are not authorized to perform this action.'
  },
  UNAUTHORIZED: {
    errorCode: 'UNAUTHORIZED',
    statusCode: 403,
    message: 'You are not authorized to perform this action.'
  },
  USER_NOT_ACTIVE: {
    errorCode: 'USER_NOT_ACTIVE',
    statusCode: 403,
    message: 'Please verify your account.'
  },

  // 404 - Not Found
  COURSE_NOT_FOUND: {
    errorCode: 'COURSE_NOT_FOUND',
    statusCode: 404,
    message: 'Course not found.'
  },
  COURSE_WAITLIST_NOT_FOUND: {
    errorCode: 'COURSE_WAITLIST_NOT_FOUND',
    statusCode: 404,
    message: 'Course waitlist entry not found'
  },
  INTERNSHIP_APPLICATION_NOT_FOUND: {
    errorCode: 'INTERNSHIP_APPLICATION_NOT_FOUND',
    statusCode: 404,
    message: 'Internship application not found.'
  },
  ORDER_NOT_FOUND: {
    errorCode: 'ORDER_NOT_FOUND',
    statusCode: 404,
    message: 'Order not found.'
  },
  RESOURCE_NOT_FOUND: {
    errorCode: 'RESOURCE_NOT_FOUND',
    statusCode: 404,
    message: 'Resource not found.',
    customMessage: (path: string) => `Resource not found. Invalid: ${path}`
  },
  ROUTE_NOT_FOUND: {
    errorCode: 'ROUTE_NOT_FOUND',
    statusCode: 404,
    message: 'Route not found.'
  },
  USER_NOT_FOUND: {
    errorCode: 'USER_NOT_FOUND',
    statusCode: 404,
    message: 'User not found.'
  },

  // 409 - Conflict
  EMAIL_ALREADY_EXISTS: {
    errorCode: 'EMAIL_ALREADY_EXISTS',
    statusCode: 409,
    message: 'Email already exists.'
  },
  PHONE_ALREADY_EXISTS: {
    errorCode: 'PHONE_ALREADY_EXISTS',
    statusCode: 409,
    message: 'Phone number already exists.'
  },
  PHONE_ALREADY_VERIFIED: {
    errorCode: 'PHONE_ALREADY_VERIFIED',
    statusCode: 409,
    message: 'Phone number already verified.'
  },

  // 500 - Internal Server Error
  DATABASE_ERROR: {
    errorCode: 'DATABASE_ERROR',
    statusCode: 500,
    message: 'Database operation failed.'
  },
  GOOGLE_OAUTH_NOT_CONFIGURED: {
    errorCode: 'GOOGLE_OAUTH_NOT_CONFIGURED',
    statusCode: 500,
    message: 'Google OAuth is not configured.'
  },
  INTERNAL_SERVER_ERROR: {
    errorCode: 'INTERNAL_SERVER_ERROR',
    statusCode: 500,
    message:
      'Oops! Something unexpected happened on our end. Please try again later.'
  },
  INVALID_ENVIRONMENT_VARIABLES: {
    errorCode: 'INVALID_ENVIRONMENT_VARIABLES',
    statusCode: 500,
    message:
      'Internal server error: environment variables are not configured properly.'
  },
  PROD_ERROR: {
    errorCode: 'UNKNOWN_ERROR',
    statusCode: 500,
    message:
      "Oops! Something unexpected happened on our end. We're on it! Please try again in a few minutes."
  },
  REDIS_CONNECTION_ERROR: {
    errorCode: 'REDIS_CONNECTION_ERROR',
    statusCode: 500,
    message: 'Redis url is not defined.'
  },
  REDIS_ERROR: {
    errorCode: 'REDIS_ERROR',
    statusCode: 500,
    message: 'redis error accured.'
  },
  UNKNOWN_ERROR: {
    errorCode: 'UNKNOWN_ERROR',
    statusCode: 500,
    message: 'An unknown error occurred.'
  },

  // 502 - Bad Gateway
  GOOGLE_OAUTH_FAILED: {
    errorCode: 'GOOGLE_OAUTH_FAILED',
    statusCode: 502,
    message: 'Failed to authenticate with Google.'
  },
  GOOGLE_PROFILE_FETCH_FAILED: {
    errorCode: 'GOOGLE_PROFILE_FETCH_FAILED',
    statusCode: 502,
    message: 'Failed to fetch profile from Google.'
  },
  OTP_SEND_FAILED: {
    errorCode: 'OTP_SEND_FAILED',
    statusCode: 502,
    message: 'Failed to send OTP'
  }
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
