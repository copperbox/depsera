import { Request, Response } from 'express';
import db from '../../db';
import { User } from '../../db/types';

export function reactivateUser(req: Request, res: Response): void {
  try {
    const { id } = req.params;

    // Check user exists
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if already active
    if (user.is_active) {
      res.status(400).json({ error: 'User is already active' });
      return;
    }

    const now = new Date().toISOString();

    // Reactivate user
    db.prepare('UPDATE users SET is_active = 1, updated_at = ? WHERE id = ?').run(now, id);

    // Return updated user
    const updatedUser = db
      .prepare('SELECT id, email, name, role, is_active, created_at, updated_at FROM users WHERE id = ?')
      .get(id) as User;

    res.json(updatedUser);
  } catch (error) {
    console.error('Error reactivating user:', error);
    res.status(500).json({
      error: 'Failed to reactivate user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
