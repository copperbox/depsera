import { Request, Response } from 'express';
import db from '../../db';
import { Team } from '../../db/types';

export function listTeams(_req: Request, res: Response): void {
  try {
    const teams = db
      .prepare('SELECT * FROM teams ORDER BY name ASC')
      .all() as Team[];

    // Get member count and service count for each team
    const teamsWithCounts = teams.map((team) => {
      const memberCount = db
        .prepare('SELECT COUNT(*) as count FROM team_members WHERE team_id = ?')
        .get(team.id) as { count: number };

      const serviceCount = db
        .prepare('SELECT COUNT(*) as count FROM services WHERE team_id = ?')
        .get(team.id) as { count: number };

      return {
        ...team,
        member_count: memberCount.count,
        service_count: serviceCount.count,
      };
    });

    res.json(teamsWithCounts);
  } catch (error) {
    console.error('Error listing teams:', error);
    res.status(500).json({
      error: 'Failed to list teams',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
