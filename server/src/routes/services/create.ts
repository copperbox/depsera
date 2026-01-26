import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { CreateServiceInput } from '../../db/types';
import { isValidUrl, MIN_POLLING_INTERVAL, DEFAULT_POLLING_INTERVAL } from './validation';
import { HealthPollingService } from '../../services/polling';

export function createService(req: Request, res: Response): void {
  try {
    const input: CreateServiceInput = req.body;
    const stores = getStores();

    // Validate required fields
    if (!input.name || typeof input.name !== 'string' || input.name.trim() === '') {
      res.status(400).json({ error: 'name is required and must be a non-empty string' });
      return;
    }

    if (!input.team_id || typeof input.team_id !== 'string') {
      res.status(400).json({ error: 'team_id is required' });
      return;
    }

    if (!input.health_endpoint || typeof input.health_endpoint !== 'string') {
      res.status(400).json({ error: 'health_endpoint is required' });
      return;
    }

    // Validate URLs
    if (!isValidUrl(input.health_endpoint)) {
      res.status(400).json({
        error: 'health_endpoint must be a valid HTTP or HTTPS URL',
      });
      return;
    }

    if (input.metrics_endpoint && !isValidUrl(input.metrics_endpoint)) {
      res.status(400).json({
        error: 'metrics_endpoint must be a valid HTTP or HTTPS URL',
      });
      return;
    }

    // Validate polling_interval
    let pollingInterval = DEFAULT_POLLING_INTERVAL;
    if (input.polling_interval !== undefined) {
      if (typeof input.polling_interval !== 'number' || input.polling_interval < MIN_POLLING_INTERVAL) {
        res.status(400).json({
          error: `polling_interval must be a number >= ${MIN_POLLING_INTERVAL} seconds`,
        });
        return;
      }
      pollingInterval = input.polling_interval;
    }

    // Verify team exists
    const team = stores.teams.findById(input.team_id);
    if (!team) {
      res.status(400).json({ error: 'Team not found' });
      return;
    }

    const service = stores.services.create({
      name: input.name.trim(),
      team_id: input.team_id,
      health_endpoint: input.health_endpoint,
      metrics_endpoint: input.metrics_endpoint || null,
      polling_interval: pollingInterval,
    });

    // Start polling for the new service (is_active defaults to 1)
    HealthPollingService.getInstance().startService(service.id);

    res.status(201).json({
      ...service,
      team,
      dependencies: [],
      health: {
        status: 'unknown',
        healthy_count: 0,
        unhealthy_count: 0,
        total_dependencies: 0,
      },
    });
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({
      error: 'Failed to create service',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
