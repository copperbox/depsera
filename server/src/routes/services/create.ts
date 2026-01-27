import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { HealthPollingService } from '../../services/polling';
import { formatNewService } from '../formatters';
import { validateServiceCreate } from '../../utils/validation';
import { ValidationError, formatError, getErrorStatusCode } from '../../utils/errors';

export function createService(req: Request, res: Response): void {
  try {
    const stores = getStores();

    // Validate input using centralized validation
    const validated = validateServiceCreate(req.body);

    // Verify team exists
    const team = stores.teams.findById(validated.team_id);
    if (!team) {
      throw new ValidationError('Team not found', 'team_id');
    }

    const service = stores.services.create({
      name: validated.name,
      team_id: validated.team_id,
      health_endpoint: validated.health_endpoint,
      metrics_endpoint: validated.metrics_endpoint,
      polling_interval: validated.polling_interval,
    });

    // Start polling for the new service (is_active defaults to 1)
    HealthPollingService.getInstance().startService(service.id);

    res.status(201).json(formatNewService(service, team));
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
