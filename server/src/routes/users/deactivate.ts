import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';
import { auditFromRequest } from '../../services/audit/AuditLogService';

export function deactivateUser(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    // Check user exists
    const user = stores.users.findById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // If deactivating an admin, ensure there's at least one other active admin
    if (user.role === 'admin' && user.is_active) {
      const adminCount = stores.users.countActiveAdmins();

      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot deactivate the last admin user' });
        return;
      }
    }

    // Deactivate user
    stores.users.update(id, { is_active: false });

    // Remove from all teams
    stores.teams.removeAllMembershipsForUser(id);

    auditFromRequest(req, 'user.deactivated', 'user', id, {
      email: user.email,
    });

    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'deactivating user');
  }
}
