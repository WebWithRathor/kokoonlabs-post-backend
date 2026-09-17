import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';
import ErrorHandler from '../utils/error-handler';

dotenvConfig();

const configSchema = z.object({
  port: z.coerce.number().default(8001),
  databaseUrl: z.string().min(1, 'MONGO_CONNECTION_STRING is required'),
  environment: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  corsOrigin: z.string().min(1, 'CORS_ORIGIN is required'),
  msg91AuthKey: z.string().min(1, 'MSG91_AUTH_KEY is required'),
  msg91TemplateId: z.string().min(1, 'MSG91_TEMPLATE_ID is required'),
  otpExpiryMinutes: z.coerce.number().default(5),
  redisUrl: z.string().min(1).default(''),
  jwtAccessSecret: z.string().min(1).default('dev-secret-change-me'),
  jwtAccessExpiresIn: z.coerce.number().default(60 * 60 * 24 * 7),
  jwtRefreshSecret: z.string().min(1).default('dev-refresh-change-me'),
  jwtRefreshExpiresIn: z.coerce.number().default(60 * 60 * 24 * 7),
  googleClientId: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  cookieAccessMaxAge: z.string().min(1, 'COOKIE_ACCESS_MAX_AGE is required'), // Consider z.coerce.number() if it should be a number
  cookieRefreshMaxAge: z.string().min(1, 'COOKIE_REFRESH_MAX_AGE is required') // Consider z.coerce.number() if it should be a number
});

const parsedConfig = configSchema.safeParse({
  port: process.env.PORT,
  databaseUrl: process.env.MONGO_CONNECTION_STRING,
  environment: process.env.NODE_ENV,
  corsOrigin: process.env.CORS_ORIGIN,
  msg91AuthKey: process.env.MSG91_AUTH_KEY,
  msg91TemplateId: process.env.MSG91_TEMPLATE_ID,
  redisUrl: process.env.REDIS_URL,
  otpExpiryMinutes: process.env.OTP_EXPIRY_MINUTES,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRATION,
  cookieAccessMaxAge: process.env.COOKIE_ACCESS_MAX_AGE,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRATION,
  cookieRefreshMaxAge: process.env.COOKIE_REFRESH_MAX_AGE,
  googleClientId: process.env.GOOGLE_CLIENT_ID
});

if (!parsedConfig.success) {
  console.error('Invalid environment variables:', {
    errors: parsedConfig.error.flatten().fieldErrors
  });
  throw new ErrorHandler(400, 'Invalid environment variables');
}

const _config = parsedConfig.data;

export const config = Object.freeze(_config);

// Optional: Define a type for better intellisense
export type ConfigType = z.infer<typeof configSchema>;
