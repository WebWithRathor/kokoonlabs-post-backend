import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { isAllowedOrigin } from '../utils/origins';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// CSRF guard. Auth cookies are SameSite=None in production, so another site
// could submit a form that carries them. Browsers always send Origin (or
// Referer) on cross-site POST/PUT/PATCH/DELETE: reject those from origins
// not in CORS_ORIGIN. Requests with neither header (server-to-server, curl)
// are allowed, since they can't carry a victim's browser cookies.
const csrfOriginGuard = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  let source = origin;
  if (!source) {
    const referer = req.get('referer');
    if (referer) {
      try {
        source = new URL(referer).origin;
      } catch {
        source = 'invalid';
      }
    }
  }

  if (source && !isAllowedOrigin(source)) {
    res.status(403).json({
      success: false,
      code: 'CSRF_ORIGIN_REJECTED',
      message: 'Request origin not allowed'
    });
    return;
  }
  next();
};

export default function configureAppSecurity(app: express.Application): void {
  // Apply security headers with customized CSP and HSTS
  app.use(
    helmet({
      // Content Security Policy configuration
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            'https://cdn.razorpay.com',
            'https://checkout.razorpay.com'
          ],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com'
          ],
          imgSrc: [
            "'self'",
            'data:',
            'https://*.cloudfront.net',
            'https://cdn.razorpay.com'
          ],
          connectSrc: [
            "'self'",
            'https://api.razorpay.com',
            'https://checkout.razorpay.com'
          ],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: [
            "'self'",
            'https://api.razorpay.com',
            'https://checkout.razorpay.com'
          ],
          frameAncestors: ["'self'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: []
        },
        reportOnly: process.env.NODE_ENV !== 'production' // Only report in development
      },
      // HTTP Strict Transport Security
      hsts:
        process.env.NODE_ENV === 'production'
          ? {
              maxAge: 31536000, // 1 year in seconds
              includeSubDomains: true,
              preload: true
            }
          : false,
      // Additional security headers
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    })
  );

  app.use(csrfOriginGuard);
}
