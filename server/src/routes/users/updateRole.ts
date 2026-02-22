import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { UserRole } from '../../db/types';
import { sendErrorResponse } from '../../utils/errors';
import { auditFromRequest } from '../../services/audit/AuditLogService';

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

    const previousRole = user.role;

    // If demoting from admin, ensure there's at least one other admin
    if (user.role === 'admin' && role === 'user') {
      const adminCount = stores.users.countActiveAdmins();

      if (adminCount <= 1) {
        res.status(400).json({ error: 'Cannot demote the last admin user' });
        return;
      }
    }

    const updatedUser = stores.users.update(id, { role });

    auditFromRequest(req, 'user.role_changed', 'user', id, {
      previousRole,
      newRole: role,
    });

    res.json(updatedUser);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'updating user role');
  }
}
