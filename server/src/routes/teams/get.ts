import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { formatTeamDetail } from '../formatters';
import { NotFoundError, sendErrorResponse } from '../../utils/errors';

export function getTeam(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    const team = stores.teams.findById(id);

    if (!team) {
      throw new NotFoundError('Team');
    }

    // Get members with user details
    const members = stores.teams.findMembers(id);

    // Get services
    const services = stores.services.findByTeamId(id);

    res.json(formatTeamDetail(team, members, services));
  } catch (error) {
    sendErrorResponse(res, error, 'getting team');
  }
}
