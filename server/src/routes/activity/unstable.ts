import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { formatError, getErrorStatusCode } from '../../utils/errors';

export function listUnstableDependencies(req: Request, res: Response): void {
  try {
    const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 168);
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);
    const stores = getStores();
    const rows = stores.statusChangeEvents.getUnstable(hours, limit);

    res.json(rows.map(r => ({
      dependency_name: r.dependency_name,
      service_name: r.service_name,
      service_id: r.service_id,
      change_count: r.change_count,
      current_healthy: r.current_healthy === 1,
      last_change_at: r.last_change_at,
    })));
  } catch (error) /* istanbul ignore next */ {
    console.error('Error listing unstable dependencies:', error);
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
