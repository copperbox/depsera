import { Request, Response } from 'express';
import { getStores } from '../../stores';
import {
  calculateAggregatedHealth,
  getDependentReports,
} from '../../utils/serviceHealth';

export function getService(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    const service = stores.services.findByIdWithTeam(id);

    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    // Get this service's own dependencies (what it depends on)
    const dependencies = stores.dependencies.findByServiceId(id);

    // Calculate aggregated health from dependent reports
    const aggregatedHealth = calculateAggregatedHealth(id);
    const dependentReports = getDependentReports(id);

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
      // What this service depends on (for reference)
      dependencies,
      // Aggregated health status from dependents
      health: aggregatedHealth,
      // Detailed reports from services that depend on this one
      dependent_reports: dependentReports,
    });
  } catch (error) {
    console.error('Error getting service:', error);
    res.status(500).json({
      error: 'Failed to get service',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
