import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { LatencyRange } from '../../stores/interfaces/ILatencyHistoryStore';
import { sendErrorResponse } from '../../utils/errors';

const VALID_RANGES: Set<string> = new Set(['1h', '6h', '24h', '7d', '30d']);

export function getAggregateLatencyBuckets(req: Request, res: Response): void {
  try {
    const dependencyIdsParam = req.query.dependencyIds as string;
    const range = (req.query.range as string) || '24h';

    if (!dependencyIdsParam) {
      res.status(400).json({ error: 'dependencyIds query parameter is required' });
      return;
    }

    const dependencyIds = dependencyIdsParam.split(',').filter(Boolean);

    if (dependencyIds.length === 0) {
      res.status(400).json({ error: 'At least one dependency ID is required' });
      return;
    }

    if (!VALID_RANGES.has(range)) {
      res.status(400).json({ error: `Invalid range. Must be one of: ${[...VALID_RANGES].join(', ')}` });
      return;
    }

    const stores = getStores();
    const buckets = stores.latencyHistory.getAggregateLatencyBuckets(dependencyIds, range as LatencyRange);

    res.json({
      dependencyIds,
      range,
      buckets,
    });
  } catch (error) /* istanbul ignore next -- Catch block for unexpected errors */ {
    sendErrorResponse(res, error, 'fetching aggregate latency buckets');
  }
}
