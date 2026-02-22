import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { TimelineRange } from '../../stores/interfaces/IErrorHistoryStore';
import { sendErrorResponse } from '../../utils/errors';

const VALID_RANGES: Set<string> = new Set(['24h', '7d', '30d']);

export function getHealthTimeline(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const range = (req.query.range as string) || '24h';
    const stores = getStores();

    /* istanbul ignore if -- Route param always present; validation for type safety */
    if (!id) {
      res.status(400).json({ error: 'Dependency ID is required' });
      return;
    }

    if (!VALID_RANGES.has(range)) {
      res.status(400).json({ error: `Invalid range. Must be one of: ${[...VALID_RANGES].join(', ')}` });
      return;
    }

    const dependency = stores.dependencies.findById(id);
    if (!dependency) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    const transitions = stores.errorHistory.getHealthTransitions(id, range as TimelineRange);

    // Determine the current state from the dependency record
    const currentState = dependency.healthy === 1 ? 'healthy' : dependency.healthy === 0 ? 'unhealthy' : 'unknown';

    res.json({
      dependencyId: id,
      range,
      currentState,
      transitions,
    });
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'fetching health timeline');
  }
}
