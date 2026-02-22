import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { sendErrorResponse } from '../../../utils/errors';

export function getAlertRules(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();

    const rules = stores.alertRules.findByTeamId(teamId);
    res.json(rules);
  } catch (error) {
    sendErrorResponse(res, error, 'getting alert rules');
  }
}
