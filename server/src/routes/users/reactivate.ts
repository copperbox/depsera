import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

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
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'reactivating user');
  }
}
