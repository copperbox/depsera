import { Request, Response } from 'express';
import { getStores } from '../../stores';

export function listTeams(_req: Request, res: Response): void {
  try {
    const stores = getStores();
    const teams = stores.teams.findAll();

    // Get member count and service count for each team
    const teamsWithCounts = teams.map((team) => ({
      ...team,
      member_count: stores.teams.getMemberCount(team.id),
      service_count: stores.teams.getServiceCount(team.id),
    }));

    res.json(teamsWithCounts);
  } catch (error) {
    console.error('Error listing teams:', error);
    res.status(500).json({
      error: 'Failed to list teams',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
