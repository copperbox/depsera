import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

export function getAuditLog(req: Request, res: Response): void {
  try {
    const stores = getStores();

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 250);
    const offset = parseInt(req.query.offset as string) || 0;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;
    const userId = req.query.userId as string | undefined;
    const action = req.query.action as string | undefined;
    const resourceType = req.query.resourceType as string | undefined;

    const filterOptions = {
      limit,
      offset,
      startDate,
      endDate,
      userId,
      action,
      resourceType,
    };

    const entries = stores.auditLog.findAll(filterOptions);
    const total = stores.auditLog.count(filterOptions);

    res.json({
      entries,
      total,
      limit,
      offset,
    });
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'fetching audit log');
  }
}
