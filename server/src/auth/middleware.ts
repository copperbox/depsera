import { Request, Response, NextFunction } from 'express';
import db from '../db';
import { User } from '../db/types';

// Extend Express Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const user = db
    .prepare('SELECT * FROM users WHERE id = ? AND is_active = 1')
    .get(req.session.userId) as User | undefined;

  if (!user) {
    req.session.destroy(() => {});
    res.status(401).json({ error: 'User not found or inactive' });
    return;
  }

  req.user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  });
}
