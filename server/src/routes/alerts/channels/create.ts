import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { sendErrorResponse } from '../../../utils/errors';
import { validateChannelCreate } from '../validation';
import logger from '../../../utils/logger';

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

    // Auto-create a default alert rule if the team has none
    const existingRules = stores.alertRules.findByTeamId(teamId);
    if (existingRules.length === 0) {
      stores.alertRules.create({
        team_id: teamId,
        severity_filter: 'all',
      });
      logger.info({ teamId }, 'auto-created default alert rule for team');
    }

    res.status(201).json(channel);
  } catch (error) {
    sendErrorResponse(res, error, 'creating alert channel');
  }
}
