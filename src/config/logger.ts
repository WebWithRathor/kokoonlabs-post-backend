import winston from 'winston';
import 'winston-daily-rotate-file'; // Import the daily rotate file transport
import { config } from '../config/config';

const productionFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const developmentConsoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(info => {
    const timestamp = String(info.timestamp);
    const level = String(info.level);
    const serviceName = String(info.serviceName);
    const message = info.message;
    const meta = info[Symbol.for('splat') as unknown as string];
    const metaString =
      meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const msg =
      typeof message === 'object' && message !== null
        ? JSON.stringify(message)
        : String(message);
    const stack = info.stack ? JSON.stringify(info.stack) : '';
    return `${timestamp} [${serviceName}] ${level}: ${msg}${metaString}${stack}`;
  })
);

const consoleFormat =
  config.environment === 'development'
    ? developmentConsoleFormat
    : productionFormat;

const logger = winston.createLogger({
  level: config.environment === 'development' ? 'debug' : 'info',
  format: productionFormat,
  defaultMeta: {
    serviceName: 'sheryians-api'
  },
  transports: [
    new winston.transports.DailyRotateFile({
      dirname: 'logs',
      filename: 'combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'info',
      silent: config.environment === 'test',
      format: productionFormat
    }),
    new winston.transports.DailyRotateFile({
      dirname: 'logs',
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
      silent: config.environment === 'test',
      format: productionFormat
    }),
    new winston.transports.Console({
      level: config.environment === 'development' ? 'debug' : 'info',
      format: consoleFormat,
      silent: config.environment === 'test'
    })
  ],
  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      dirname: 'logs',
      filename: 'exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: productionFormat,
      silent: config.environment === 'test'
    })
  ],
  rejectionHandlers: [
    new winston.transports.DailyRotateFile({
      dirname: 'logs',
      filename: 'rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: productionFormat,
      silent: config.environment === 'test'
    })
  ],
  exitOnError: false
});

if (config.environment === 'development') {
  logger.exceptions.handle(
    new winston.transports.Console({ format: developmentConsoleFormat })
  );
  logger.rejections.handle(
    new winston.transports.Console({ format: developmentConsoleFormat })
  );
}

export default logger;
