import express from 'express';
import helmet from 'helmet';

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
}
