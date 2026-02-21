import { Request, Response, NextFunction } from 'express';
import { getStores } from '../stores';
import { User } from '../db/types';

const BYPASS_CONFIRM_VALUE = 'yes-i-know-what-im-doing';

const DEV_USER = {
  email: process.env.AUTH_BYPASS_USER_EMAIL || 'dev@localhost',
  name: process.env.AUTH_BYPASS_USER_NAME || 'Development User',
  oidc_subject: 'dev-bypass-user',
  role: 'admin' as const,
  is_active: 1,
};

export function isBypassEnabled(): boolean {
  return process.env.AUTH_BYPASS === 'true';
}

export function initializeBypassMode(): void {
  if (process.env.NODE_ENV === 'production' && isBypassEnabled()) {
    throw new Error('AUTH_BYPASS=true is not allowed in production');
  }

  if (isBypassEnabled()) {
    if (process.env.AUTH_BYPASS_CONFIRM !== BYPASS_CONFIRM_VALUE) {
      throw new Error(
        `AUTH_BYPASS=true requires AUTH_BYPASS_CONFIRM="${BYPASS_CONFIRM_VALUE}" to prevent accidental activation`
      );
    }

    console.warn('\n========================================');
    console.warn('WARNING: Auth bypass mode is enabled');
    console.warn('All requests will be auto-authenticated as an admin user.');
    console.warn('DO NOT USE IN PRODUCTION');
    console.warn('========================================\n');
  }
}

export function bypassAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isBypassEnabled()) {
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
