import { Request, Response } from 'express';
import db from '../../db';
import { User } from '../../db/types';

export function deactivateUser(req: Request, res: Response): void {
  try {
    const { id } = req.params;

    // Check user exists
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // If deactivating an admin, ensure there's at least one other active admin
    if (user.role === 'admin' && user.is_active) {
      const adminCount = db
        .prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = 1')
        .get('admin') as { count: number };

      if (adminCount.count <= 1) {
        res.status(400).json({ error: 'Cannot deactivate the last admin user' });
        return;
      }
    }

    const now = new Date().toISOString();

    // Deactivate user
    db.prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?').run(now, id);

    // Remove from all teams
    db.prepare('DELETE FROM team_members WHERE user_id = ?').run(id);

    res.status(204).send();
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({
      error: 'Failed to deactivate user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
