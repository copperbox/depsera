import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { ServiceListOptions } from '../../stores/types';
import { sendErrorResponse } from '../../utils/errors';
import { formatServiceDetail } from '../formatters/serviceFormatter';
import { getDependentReports } from '../../utils/serviceHealth';
import { resolveDependencyOverridesWithCanonical } from '../../utils/dependencyOverrideResolver';

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

    // Fetch canonical overrides once for efficient resolution across all services
    const canonicalOverrides = stores.canonicalOverrides.findAll();

    // Format with health data (same pattern as GET /api/services)
    const result = rows.map((row) => {
      const dependencies = stores.dependencies.findByServiceId(row.id);
      const resolvedDeps = resolveDependencyOverridesWithCanonical(dependencies, canonicalOverrides, row.team_id);
      const dependentReports = getDependentReports(row.id);
      return formatServiceDetail(row, resolvedDeps, dependentReports);
    });

    res.json(result);
  } catch (error) {
    sendErrorResponse(res, error, 'listing external services');
  }
}
