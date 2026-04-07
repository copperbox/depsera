import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

/**
 * GET /api/admin/api-keys/:keyId/usage
 * Admin version of the usage time series endpoint; no team membership check.
 */
export function getAdminApiKeyUsage(req: Request, res: Response): void {
  try {
    const keyId = req.params.keyId;
    const stores = getStores();

    const key = stores.teamApiKeys.findById(keyId);
    if (!key) {
      res.status(404).json({ error: 'API key not found' });
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
    sendErrorResponse(res, error, 'fetching admin API key usage');
  }
}

/**
 * GET /api/admin/otlp-usage
 * Cross-team usage overview for the admin dashboard.
 */
export function getAdminOtlpUsage(req: Request, res: Response): void {
  try {
    const stores = getStores();
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const from = (req.query.from as string) || defaultFrom.toISOString();
    const to = (req.query.to as string) || now.toISOString();

    const allBuckets = stores.apiKeyUsage.getAllBuckets('hour', from, to);

    res.json({ from, to, buckets: allBuckets });
  } catch (error) {
    sendErrorResponse(res, error, 'fetching admin OTLP usage');
  }
}
