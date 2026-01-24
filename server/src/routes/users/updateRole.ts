import { Request, Response } from 'express';
import db from '../../db';
import { User, UserRole } from '../../db/types';

export function updateUserRole(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // Validate role
    const validRoles: UserRole[] = ['admin', 'user'];
    if (!role || !validRoles.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
      return;
    }

    // Check user exists
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // If demoting from admin, ensure there's at least one other admin
    if (user.role === 'admin' && role === 'user') {
      const adminCount = db
        .prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = 1')
        .get('admin') as { count: number };

      if (adminCount.count <= 1) {
        res.status(400).json({ error: 'Cannot demote the last admin user' });
        return;
      }
    }

    const now = new Date().toISOString();

    db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now, id);

    const updatedUser = db
      .prepare('SELECT id, email, name, role, is_active, created_at, updated_at FROM users WHERE id = ?')
      .get(id) as User;

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({
      error: 'Failed to update user role',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
