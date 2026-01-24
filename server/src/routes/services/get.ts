import { Request, Response } from 'express';
import db from '../../db';
import { Service, Dependency } from '../../db/types';

export function getService(req: Request, res: Response): void {
  try {
    const { id } = req.params;

    const service = db
      .prepare(
        `
        SELECT
          s.*,
          t.id as team_id,
          t.name as team_name,
          t.description as team_description,
          t.created_at as team_created_at,
          t.updated_at as team_updated_at
        FROM services s
        JOIN teams t ON s.team_id = t.id
        WHERE s.id = ?
      `
      )
      .get(id) as
      | (Service & {
          team_name: string;
          team_description: string | null;
          team_created_at: string;
          team_updated_at: string;
        })
      | undefined;

    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    // Get dependencies
    const dependencies = db
      .prepare('SELECT * FROM dependencies WHERE service_id = ? ORDER BY name ASC')
      .all(id) as Dependency[];

    // Compute health status
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
      dependencies,
      health: {
        status: healthStatus,
        healthy_count: healthyCount,
        unhealthy_count: unhealthyCount,
        total_dependencies: totalCount,
      },
    });
  } catch (error) {
    console.error('Error getting service:', error);
    res.status(500).json({
      error: 'Failed to get service',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
