import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';
import { auditFromRequest } from '../../services/audit/AuditLogService';

const DEFAULT_SPAN_RETENTION_DAYS = 7;
const MIN_SPAN_RETENTION_DAYS = 1;
const MAX_SPAN_RETENTION_DAYS = 365;

export function getSpanRetention(_req: Request, res: Response): void {
  try {
    const stores = getStores();
    const value = stores.appSettings.get('span_retention_days');
    const days = value ? parseInt(value, 10) : DEFAULT_SPAN_RETENTION_DAYS;

    res.json({ days });
  } catch (error) {
    sendErrorResponse(res, error, 'fetching span retention setting');
  }
}

export function updateSpanRetention(req: Request, res: Response): void {
  try {
    const { days } = req.body;

    if (typeof days !== 'number' || !Number.isInteger(days)) {
      res.status(400).json({ error: 'days must be an integer' });
      return;
    }

    if (days < MIN_SPAN_RETENTION_DAYS || days > MAX_SPAN_RETENTION_DAYS) {
      res.status(400).json({
        error: `days must be between ${MIN_SPAN_RETENTION_DAYS} and ${MAX_SPAN_RETENTION_DAYS}`,
      });
      return;
    }

    const stores = getStores();
    stores.appSettings.set('span_retention_days', String(days), req.user!.id);

    auditFromRequest(req, 'settings.updated', 'settings', undefined, {
      key: 'span_retention_days',
      value: days,
    });

    res.json({ days });
  } catch (error) {
    sendErrorResponse(res, error, 'updating span retention setting');
  }
}
