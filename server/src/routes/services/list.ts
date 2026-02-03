import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { formatServiceDetail } from '../formatters';
import { getDependentReports } from '../../utils/serviceHealth';
import { formatError, getErrorStatusCode } from '../../utils/errors';

export function listServices(req: Request, res: Response): void {
  try {
    const { team_id } = req.query;
    const stores = getStores();

    const rows = stores.services.findAllWithTeam({
      teamId: team_id && typeof team_id === 'string' ? team_id : undefined,
    });

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
