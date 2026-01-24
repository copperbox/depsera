import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import db from '../db';
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

  // Skip if session already has a user
  if (req.session.userId) {
    // Load user into request
    const user = db
      .prepare('SELECT * FROM users WHERE id = ? AND is_active = 1')
      .get(req.session.userId) as User | undefined;
    if (user) {
      req.user = user;
    }
    next();
    return;
  }

  // Check for existing dev user or create one
  let user = db
    .prepare('SELECT * FROM users WHERE oidc_subject = ?')
    .get(DEV_USER.oidc_subject) as User | undefined;

  if (!user) {
    const id = randomUUID();
    db.prepare(`
      INSERT INTO users (id, email, name, oidc_subject, role, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, DEV_USER.email, DEV_USER.name, DEV_USER.oidc_subject, DEV_USER.role, DEV_USER.is_active);

    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User;
    console.log(`Created dev bypass user: ${user.email}`);
  }

  req.session.userId = user.id;
  req.user = user;
  next();
}
