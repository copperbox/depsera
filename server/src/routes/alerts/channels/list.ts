import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { sendErrorResponse } from '../../../utils/errors';

export function listAlertChannels(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();

    const channels = stores.alertChannels.findByTeamId(teamId);
    res.json(channels);
  } catch (error) {
    sendErrorResponse(res, error, 'listing alert channels');
  }
}
