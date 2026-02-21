import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { hashPassword } from '../../auth/localAuth';
import { sendErrorResponse } from '../../utils/errors';
import { auditFromRequest } from '../../services/audit/AuditLogService';

const MIN_PASSWORD_LENGTH = 8;

export function resetPassword(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const stores = getStores();

    // Validate password
    if (!password || typeof password !== 'string') {
      res.status(400).json({ error: 'password is required' });
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }

    // Check user exists
    const user = stores.users.findById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Hash and update password
    const passwordHash = hashPassword(password);
    const updated = stores.users.updatePasswordHash(id, passwordHash);

    if (!updated) {
      res.status(500).json({ error: 'Failed to update password' });
      return;
    }

    auditFromRequest(req, 'user.password_reset', 'user', id, {
      email: user.email,
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'resetting password');
  }
}
