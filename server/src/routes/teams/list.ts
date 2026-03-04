import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { formatTeamListItem } from '../formatters';
import { sendErrorResponse } from '../../utils/errors';

export function listTeams(_req: Request, res: Response): void {
  try {
    const stores = getStores();
    const teams = stores.teams.findAll();

    // Get member count and service count for each team
    const teamsWithCounts = teams.map((team) =>
      formatTeamListItem(
        team,
        stores.teams.getMemberCount(team.id),
        stores.teams.getServiceCount(team.id)
      )
    );

    res.json(teamsWithCounts);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'listing teams');
  }
}
