import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { formatError, getErrorStatusCode } from '../../utils/errors';

export function listRecentActivity(req: Request, res: Response): void {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const stores = getStores();
    const events = stores.statusChangeEvents.getRecent(limit);

    res.json(events.map(e => ({
      id: e.id,
      service_id: e.service_id,
      service_name: e.service_name,
      dependency_name: e.dependency_name,
      previous_healthy: e.previous_healthy === null ? null : e.previous_healthy === 1,
      current_healthy: e.current_healthy === 1,
      recorded_at: e.recorded_at,
    })));
  } catch (error) /* istanbul ignore next */ {
    console.error('Error listing recent activity:', error);
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
