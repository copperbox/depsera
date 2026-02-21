import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { getDependentReports } from '../../utils/serviceHealth';
import { formatServiceDetail } from '../formatters';
import { NotFoundError, formatError, getErrorStatusCode } from '../../utils/errors';
import { AuthorizationService } from '../../auth/authorizationService';

export function getService(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();
    const user = req.user!;

    const service = stores.services.findByIdWithTeam(id);

    if (!service) {
      throw new NotFoundError('Service');
    }

    // Non-admin users must be a member of the service's owning team
    if (user.role !== 'admin') {
      const result = AuthorizationService.checkTeamAccess(user, service.team_id);
      if (!result.authorized) {
        res.status(403).json({ error: 'Team access required' });
        return;
      }
    }

    // Get this service's own dependencies (what it depends on)
    const dependencies = stores.dependencies.findByServiceId(id);

    // Get detailed reports from services that depend on this one
    const dependentReports = getDependentReports(id);

    res.json(formatServiceDetail(service, dependencies, dependentReports));
  } catch (error) {
    console.error('Error getting service:', error);
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
