import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { UpdateServiceInput } from '../../db/types';
import { isValidUrl, MIN_POLLING_INTERVAL } from './validation';
import { HealthPollingService } from '../../services/polling';

export function updateService(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const input: UpdateServiceInput = req.body;
    const stores = getStores();

    // Check if service exists
    const existingService = stores.services.findById(id);
    if (!existingService) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    // Validate fields if provided
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || input.name.trim() === '') {
        res.status(400).json({ error: 'name must be a non-empty string' });
        return;
      }
    }

    if (input.team_id !== undefined) {
      if (!stores.teams.exists(input.team_id)) {
        res.status(400).json({ error: 'Team not found' });
        return;
      }
    }

    if (input.health_endpoint !== undefined) {
      if (!isValidUrl(input.health_endpoint)) {
        res.status(400).json({
          error: 'health_endpoint must be a valid HTTP or HTTPS URL',
        });
        return;
      }
    }

    if (input.metrics_endpoint !== undefined && input.metrics_endpoint !== null) {
      if (!isValidUrl(input.metrics_endpoint)) {
        res.status(400).json({
          error: 'metrics_endpoint must be a valid HTTP or HTTPS URL',
        });
        return;
      }
    }

    if (input.polling_interval !== undefined) {
      if (typeof input.polling_interval !== 'number' || input.polling_interval < MIN_POLLING_INTERVAL) {
        res.status(400).json({
          error: `polling_interval must be a number >= ${MIN_POLLING_INTERVAL} seconds`,
        });
        return;
      }
    }

    // Check if there are any valid fields to update
    const hasUpdates = input.name !== undefined ||
      input.team_id !== undefined ||
      input.health_endpoint !== undefined ||
      input.metrics_endpoint !== undefined ||
      input.polling_interval !== undefined ||
      input.is_active !== undefined;

    if (!hasUpdates) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    // Update via repository
    stores.services.update(id, {
      name: input.name?.trim(),
      team_id: input.team_id,
      health_endpoint: input.health_endpoint,
      metrics_endpoint: input.metrics_endpoint,
      polling_interval: input.polling_interval,
      is_active: input.is_active,
    });

    // Update polling service if is_active or polling_interval changed
    if (input.is_active !== undefined || input.polling_interval !== undefined || input.health_endpoint !== undefined) {
      const pollingService = HealthPollingService.getInstance();
      const newIsActive = input.is_active !== undefined ? input.is_active : existingService.is_active === 1;

      if (newIsActive) {
        // Restart to pick up new interval or endpoint
        pollingService.restartService(id);
      } else {
        // Stop polling for deactivated service
        pollingService.stopService(id);
      }
    }

    // Fetch updated service with team
    const service = stores.services.findByIdWithTeam(id)!;
    const dependencies = stores.dependencies.findByServiceId(id);

    const healthyCount = dependencies.filter((d) => d.healthy === 1).length;
    const unhealthyCount = dependencies.filter((d) => d.healthy === 0).length;
    const totalCount = dependencies.length;

    let healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown' = 'unknown';
    if (totalCount === 0) {
      healthStatus = 'unknown';
    } else if (unhealthyCount > 0) {
      healthStatus = 'unhealthy';
    } else if (healthyCount === totalCount) {
      healthStatus = 'healthy';
    } else {
      healthStatus = 'degraded';
    }

    res.json({
      id: service.id,
      name: service.name,
      team_id: service.team_id,
      health_endpoint: service.health_endpoint,
      metrics_endpoint: service.metrics_endpoint,
      polling_interval: service.polling_interval,
      is_active: service.is_active,
      created_at: service.created_at,
      updated_at: service.updated_at,
      team: {
        id: service.team_id,
        name: service.team_name,
        description: service.team_description,
        created_at: service.team_created_at,
        updated_at: service.team_updated_at,
      },
      health: {
        status: healthStatus,
        healthy_count: healthyCount,
        unhealthy_count: unhealthyCount,
        total_dependencies: totalCount,
      },
    });
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({
      error: 'Failed to update service',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
