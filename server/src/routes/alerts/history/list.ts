import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { sendErrorResponse, ValidationError } from '../../../utils/errors';
import { AlertStatus } from '../../../db/types';

const VALID_STATUSES: AlertStatus[] = ['sent', 'failed', 'suppressed'];

export function listAlertHistory(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 250);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const status = req.query.status as string | undefined;
    if (status && !VALID_STATUSES.includes(status as AlertStatus)) {
      throw new ValidationError(`status must be one of: ${VALID_STATUSES.join(', ')}`, 'status');
    }

    const history = stores.alertHistory.findByTeamId(teamId, {
      limit,
      offset,
      status,
    });

    res.json({ entries: history, limit, offset });
  } catch (error) {
    sendErrorResponse(res, error, 'listing alert history');
  }
}
