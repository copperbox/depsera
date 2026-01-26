import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { UserRole } from '../../db/types';

export function updateUserRole(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const stores = getStores();

    // Validate role
    const validRoles: UserRole[] = ['admin', 'user'];
    if (!role || !validRoles.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
      return;
    }

    // Check user exists
    const user = stores.users.findById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // If demoting from admin, ensure there's at least one other admin
    if (user.role === 'admin' && role === 'user') {
      const adminCount = stores.users.countActiveAdmins();

      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot demote the last admin user' });
        return;
      }
    }

    const updatedUser = stores.users.update(id, { role });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({
      error: 'Failed to update user role',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
