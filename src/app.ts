import express, { Request, Response } from 'express';
import errorMiddleware from './middlewares/error.middleware';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import compression from 'compression';
import ResponseHandler from './utils/response-handler';
import { isAllowedOrigin } from './utils/origins';

import configureAppSecurity from './config/security';

// import routes
import Router from './routes';
import morgan from 'morgan';
// import { configureTracking } from './config/tracking';

const app = express();

// Trust proxy - required for rate limiting behind proxies like Digital Ocean App Platform
app.set('trust proxy', 1);

// body parser middleware to handle raw json and form data with limit of 10mb and 10mb respectively
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// cookie parser middleware to handle cookies in request
app.use(cookieParser());

// morgan logger middleware for logging HTTP requests
app.use(morgan('tiny'));

// cors middleware to handle cross-origin requests
app.use(
  cors({
    origin(requestOrigin: string | undefined, callback) {
      if (!requestOrigin || isAllowedOrigin(requestOrigin)) {
        callback(null, true);
      } else {
        // No CORS headers: the browser blocks the response. Unsafe methods
        // from this origin are refused with 403 by the CSRF guard.
        callback(null, false);
      }
    },
    credentials: true
  })
);

// Add compression middleware here, before routes
app.use(
  compression({
    level: 7,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false; // Bypass compression for specific requests
      }
      return compression.filter(req, res);
    }
  })
);

// Apply security configuration including CSRF
configureAppSecurity(app);

// Apply tracking configuration
// configureTracking(app);

// API routes
app.use('/api/v1', Router);

// 404 middleware
app.use((req: Request, res: Response) => {
  ResponseHandler.notFound(
    `Route not found: ${req.method} ${req.originalUrl}`
  ).send(res);
});

// Error middleware
app.use(errorMiddleware);

export default app;
