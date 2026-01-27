import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { formatServiceListItem } from '../formatters';
import { formatError, getErrorStatusCode } from '../../utils/errors';

export function listServices(req: Request, res: Response): void {
  try {
    const { team_id } = req.query;
    const stores = getStores();

    const rows = stores.services.findAllWithTeam({
      teamId: team_id && typeof team_id === 'string' ? team_id : undefined,
    });

    // Format each service with aggregated health from dependent reports
    const servicesWithHealth = rows.map(formatServiceListItem);

    res.json(servicesWithHealth);
  } catch (error) {
    console.error('Error listing services:', error);
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
