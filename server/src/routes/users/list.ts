import { Request, Response } from 'express';
import db from '../../db';
import { User } from '../../db/types';

export function listUsers(_req: Request, res: Response): void {
  try {
    const users = db
      .prepare('SELECT id, email, name, role, is_active, created_at, updated_at FROM users ORDER BY name ASC')
      .all() as User[];

    res.json(users);
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({
      error: 'Failed to list users',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
