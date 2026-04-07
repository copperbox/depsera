import { Router, Request, Response } from 'express';
import { requireTeamLead } from '../../auth';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';
import { evictBucket } from '../../middleware/perKeyRateLimit';

const router = Router({ mergeParams: true });

/**
 * PATCH /api/teams/:id/api-keys/:keyId/rate-limit
 * Team lead endpoint to update their own key's rate limit.
 */
router.patch('/:keyId/rate-limit', requireTeamLead, (req: Request, res: Response): void => {
  try {
    const teamId = req.params.id;
    const keyId = req.params.keyId;
    const stores = getStores();

    const key = stores.teamApiKeys.findById(keyId);
    if (!key || key.team_id !== teamId) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    if (key.rate_limit_admin_locked === 1) {
      res.status(403).json({ error: 'Rate limit locked by admin' });
      return;
    }

    const { rate_limit_rpm } = req.body;

    if (rate_limit_rpm !== null) {
      if (rate_limit_rpm === 0) {
        res.status(400).json({ error: 'Unlimited (0) can only be set by admins' });
        return;
      }
      if (typeof rate_limit_rpm !== 'number' || !Number.isInteger(rate_limit_rpm) || rate_limit_rpm < 1) {
        res.status(400).json({ error: 'rate_limit_rpm must be a positive integer or null' });
        return;
      }
      if (rate_limit_rpm > 1_500_000) {
        res.status(400).json({ error: 'rate_limit_rpm exceeds maximum of 1,500,000' });
        return;
      }
    }

    const updated = stores.teamApiKeys.updateRateLimit(keyId, rate_limit_rpm);
    evictBucket(keyId);

    const { key_hash: _hash, ...sanitized } = updated;
    res.json(sanitized);
  } catch (error) {
    sendErrorResponse(res, error, 'updating API key rate limit');
  }
});

export default router;
