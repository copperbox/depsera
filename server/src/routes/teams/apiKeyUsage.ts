import { Router, Request, Response } from 'express';
import { requireTeamLead } from '../../auth';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

const router = Router({ mergeParams: true });

/**
 * GET /api/teams/:id/api-keys/:keyId/usage
 * Team endpoint to fetch a key's usage time series.
 */
router.get('/:keyId/usage', requireTeamLead, (req: Request, res: Response): void => {
  try {
    const teamId = req.params.id;
    const keyId = req.params.keyId;
    const stores = getStores();

    const key = stores.teamApiKeys.findById(keyId);
    if (!key || key.team_id !== teamId) {
      res.status(403).json({ error: 'API key does not belong to this team' });
      return;
    }

    const granularity = (req.query.granularity as 'minute' | 'hour') || 'minute';
    if (granularity !== 'minute' && granularity !== 'hour') {
      res.status(400).json({ error: 'granularity must be "minute" or "hour"' });
      return;
    }

    const now = new Date();
    const defaultFrom = granularity === 'minute'
      ? new Date(now.getTime() - 24 * 60 * 60 * 1000)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const from = (req.query.from as string) || defaultFrom.toISOString();
    const to = (req.query.to as string) || now.toISOString();

    const buckets = stores.apiKeyUsage.getBuckets(keyId, granularity, from, to);

    res.json({ api_key_id: keyId, granularity, from, to, buckets });
  } catch (error) {
    sendErrorResponse(res, error, 'fetching API key usage');
  }
});

export default router;
