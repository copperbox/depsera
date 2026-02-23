import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { formatServiceDetail } from '../formatters';
import { getDependentReports } from '../../utils/serviceHealth';
import { formatError, getErrorStatusCode } from '../../utils/errors';
import { ServiceListOptions } from '../../stores/types';

export function listServices(req: Request, res: Response): void {
  try {
    const { team_id, orderBy, orderDirection } = req.query;
    const stores = getStores();
    const user = req.user!;

    const options: ServiceListOptions = { isExternal: false };

    if (orderBy && typeof orderBy === 'string') {
      // findAllWithTeam uses aliased columns (s.name, s.created_at, etc.)
      options.orderBy = orderBy.startsWith('s.') ? orderBy : `s.${orderBy}`;
    }
    if (orderDirection && typeof orderDirection === 'string') {
      options.orderDirection = orderDirection as 'ASC' | 'DESC';
    }

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
    // Admin without team_id filter: no scoping needed (returns all)

    const rows = stores.services.findAllWithTeam(options);

    // Format each service with dependencies and dependent reports
    const servicesWithDetails = rows.map((row) => {
      const dependencies = stores.dependencies.findByServiceId(row.id);
      const dependentReports = getDependentReports(row.id);
      return formatServiceDetail(row, dependencies, dependentReports);
    });

    res.json(servicesWithDetails);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    console.error('Error listing services:', error);
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
