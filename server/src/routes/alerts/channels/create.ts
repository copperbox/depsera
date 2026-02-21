import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { sendErrorResponse } from '../../../utils/errors';
import { validateChannelCreate } from '../validation';

export function createAlertChannel(req: Request, res: Response): void {
  try {
    const teamId = req.params.id;
    const stores = getStores();

    const validated = validateChannelCreate(req.body);

    const channel = stores.alertChannels.create({
      team_id: teamId,
      channel_type: validated.channel_type,
      config: validated.config,
    });

    res.status(201).json(channel);
  } catch (error) {
    sendErrorResponse(res, error, 'creating alert channel');
  }
}
