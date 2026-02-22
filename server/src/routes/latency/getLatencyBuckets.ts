import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { LatencyRange } from '../../stores/interfaces/ILatencyHistoryStore';
import { sendErrorResponse } from '../../utils/errors';

const VALID_RANGES: Set<string> = new Set(['1h', '6h', '24h', '7d', '30d']);

export function getLatencyBuckets(req: Request, res: Response): void {
  try {
    const { dependencyId } = req.params;
    const range = (req.query.range as string) || '24h';
    const stores = getStores();

    /* istanbul ignore if -- Route param always present; validation for type safety */
    if (!dependencyId) {
      res.status(400).json({ error: 'Dependency ID is required' });
      return;
    }

    if (!VALID_RANGES.has(range)) {
      res.status(400).json({ error: `Invalid range. Must be one of: ${[...VALID_RANGES].join(', ')}` });
      return;
    }

    const dependency = stores.dependencies.findById(dependencyId);
    if (!dependency) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    const buckets = stores.latencyHistory.getLatencyBuckets(dependencyId, range as LatencyRange);

    res.json({
      dependencyId,
      range,
      buckets,
    });
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'fetching latency buckets');
  }
}
