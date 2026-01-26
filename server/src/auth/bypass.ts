import { Request, Response, NextFunction } from 'express';
import { getStores } from '../stores';
import { User } from '../db/types';

const DEV_USER = {
  email: process.env.AUTH_BYPASS_USER_EMAIL || 'dev@localhost',
  name: process.env.AUTH_BYPASS_USER_NAME || 'Development User',
  oidc_subject: 'dev-bypass-user',
  role: 'admin' as const,
  is_active: 1,
};

export function initializeBypassMode(): void {
  if (process.env.NODE_ENV === 'production' && process.env.AUTH_BYPASS === 'true') {
    throw new Error('AUTH_BYPASS=true is not allowed in production');
  }

  if (process.env.AUTH_BYPASS === 'true') {
    console.warn('\n========================================');
    console.warn('WARNING: Auth bypass mode is enabled');
    console.warn('DO NOT USE IN PRODUCTION');
    console.warn('========================================\n');
  }
}

export function bypassAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (process.env.AUTH_BYPASS !== 'true') {
    next();
    return;
  }

  const stores = getStores();

  // Skip if session already has a user
  if (req.session.userId) {
    // Load user into request
    const user = stores.users.findById(req.session.userId);
    if (user && user.is_active) {
      req.user = user;
    }
    next();
    return;
  }

  // Check for existing dev user or create one
  let user = stores.users.findByOidcSubject(DEV_USER.oidc_subject);

  if (!user) {
    user = stores.users.create({
      email: DEV_USER.email,
      name: DEV_USER.name,
      oidc_subject: DEV_USER.oidc_subject,
      role: DEV_USER.role,
    });
    console.log(`Created dev bypass user: ${user.email}`);
  }

  req.session.userId = user.id;
  req.user = user;
  next();
}
