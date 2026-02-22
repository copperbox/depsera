import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { ServiceListOptions } from '../../stores/types';
import { sendErrorResponse } from '../../utils/errors';

export function listExternalServices(req: Request, res: Response): void {
  try {
    const { team_id } = req.query;
    const stores = getStores();
    const user = req.user!;

    const options: ServiceListOptions = { isExternal: true };

    if (team_id && typeof team_id === 'string') {
      // Explicit team filter: non-admin users must be a member of that team
      if (user.role !== 'admin') {
        const membership = stores.teams.getMembership(team_id, user.id);
        if (!membership) {
          res.status(403).json({ error: 'Team access required' });
          return;
        }
      }
      options.teamId = team_id;
    } else if (user.role !== 'admin') {
      // No explicit filter: scope to user's teams
      const memberships = stores.teams.getMembershipsByUserId(user.id);
      const teamIds = memberships.map((m) => m.team_id);
      if (teamIds.length === 0) {
        res.json([]);
        return;
      }
      options.teamIds = teamIds;
    }
    // Admin without team_id filter: returns all external services

    const rows = stores.services.findAllWithTeam(options);

    // Format for client — include team info as nested object
    const result = rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      team_id: row.team_id,
      team: {
        id: row.team_id,
        name: row.team_name,
        description: row.team_description ?? null,
      },
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    res.json(result);
  } catch (error) {
    sendErrorResponse(res, error, 'listing external services');
  }
}
