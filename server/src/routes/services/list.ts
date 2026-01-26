import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { calculateAggregatedHealth } from '../../utils/serviceHealth';

export function listServices(req: Request, res: Response): void {
  try {
    const { team_id } = req.query;
    const stores = getStores();

    const rows = stores.services.findAllWithTeam({
      teamId: team_id && typeof team_id === 'string' ? team_id : undefined,
    });

    // Calculate aggregated health for each service based on dependent reports
    const servicesWithHealth = rows.map((row) => {
      const aggregatedHealth = calculateAggregatedHealth(row.id);

      return {
        id: row.id,
        name: row.name,
        team_id: row.team_id,
        health_endpoint: row.health_endpoint,
        metrics_endpoint: row.metrics_endpoint,
        polling_interval: row.polling_interval,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
        team: {
          id: row.team_id,
          name: row.team_name,
          description: row.team_description,
          created_at: row.team_created_at,
          updated_at: row.team_updated_at,
        },
        health: aggregatedHealth,
      };
    });

    res.json(servicesWithHealth);
  } catch (error) {
    console.error('Error listing services:', error);
    res.status(500).json({
      error: 'Failed to list services',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
