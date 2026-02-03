import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { HealthPollingService } from '../../services/polling';
import { formatUpdatedService } from '../formatters';
import { validateServiceUpdate } from '../../utils/validation';
import { NotFoundError, ValidationError, formatError, getErrorStatusCode } from '../../utils/errors';

export function updateService(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    // Check if service exists
    const existingService = stores.services.findById(id);
    if (!existingService) {
      throw new NotFoundError('Service');
    }

    // Validate input using centralized validation
    const validated = validateServiceUpdate(req.body);
    if (!validated) {
      throw new ValidationError('No valid fields to update');
    }

    // Verify team exists if changing team_id
    /* istanbul ignore if -- Edge case: team deleted after validation; defensive check */
    if (validated.team_id !== undefined) {
      if (!stores.teams.exists(validated.team_id)) {
        throw new ValidationError('Team not found', 'team_id');
      }
    }

    // Update via repository
    stores.services.update(id, {
      name: validated.name,
      team_id: validated.team_id,
      health_endpoint: validated.health_endpoint,
      metrics_endpoint: validated.metrics_endpoint,
      poll_interval_ms: validated.poll_interval_ms,
      is_active: validated.is_active,
    });

    // Update polling service if is_active, health_endpoint, or poll_interval_ms changed
    if (
      validated.is_active !== undefined ||
      validated.health_endpoint !== undefined ||
      validated.poll_interval_ms !== undefined
    ) {
      const pollingService = HealthPollingService.getInstance();
      const newIsActive =
        validated.is_active !== undefined
          ? validated.is_active
          : existingService.is_active === 1;

      if (newIsActive) {
        // Restart to pick up new interval or endpoint
        pollingService.restartService(id);
      } else {
        // Stop polling for deactivated service
        pollingService.stopService(id);
      }
    }

    // Format and return updated service
    const formatted = formatUpdatedService(id);
    /* istanbul ignore if -- Unreachable: service was just updated successfully */
    if (!formatted) {
      throw new NotFoundError('Service');
    }

    res.json(formatted);
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
