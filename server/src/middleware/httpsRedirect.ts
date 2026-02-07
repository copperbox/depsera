import { Request, Response, NextFunction } from 'express';

/**
 * Factory returning middleware that redirects HTTP requests to HTTPS.
 *
 * - No-op when REQUIRE_HTTPS env var is not "true"
 * - Skips redirect when req.secure is already true
 * - Exempts /api/health (load-balancer probes use HTTP)
 * - 301 redirect to https://{hostname}{originalUrl}
 */
export function createHttpsRedirect() {
  const enabled = process.env.REQUIRE_HTTPS === 'true';

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!enabled || req.secure || req.path === '/api/health') {
      return next();
    }

    res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
  };
}
