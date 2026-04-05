import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';
import { evictBucket } from '../../middleware/perKeyRateLimit';

/**
 * PATCH /api/admin/api-keys/:keyId/rate-limit
 * Admin endpoint to update any key's rate limit and manage the admin lock.
 */
export function updateAdminApiKeyRateLimit(req: Request, res: Response): void {
  try {
    const keyId = req.params.keyId;
    const stores = getStores();

    const key = stores.teamApiKeys.findById(keyId);
    if (!key) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    const { rate_limit_rpm, admin_locked } = req.body;

    // Validate rate_limit_rpm if provided
    if (rate_limit_rpm !== undefined && rate_limit_rpm !== null) {
      if (typeof rate_limit_rpm !== 'number' || !Number.isInteger(rate_limit_rpm) || rate_limit_rpm < 0) {
        res.status(400).json({ error: 'rate_limit_rpm must be a non-negative integer or null' });
        return;
      }
    }

    let updated;
    if (admin_locked !== undefined) {
      updated = stores.teamApiKeys.setAdminLock(keyId, !!admin_locked, rate_limit_rpm);
    } else {
      updated = stores.teamApiKeys.updateRateLimit(keyId, rate_limit_rpm);
    }

    evictBucket(keyId);

    const { key_hash: _hash, ...sanitized } = updated;
    res.json(sanitized);
  } catch (error) {
    sendErrorResponse(res, error, 'updating admin API key rate limit');
  }
}
