import { Request, Response } from 'express';
import { getStores } from '../../stores';

export function reactivateUser(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    // Check user exists
    const user = stores.users.findById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if already active
    if (user.is_active) {
      res.status(400).json({ error: 'User is already active' });
      return;
    }

    // Reactivate user
    const updatedUser = stores.users.update(id, { is_active: true });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error reactivating user:', error);
    res.status(500).json({
      error: 'Failed to reactivate user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
