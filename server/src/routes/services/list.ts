import { Request, Response } from 'express';
import db from '../../db';
import { Service, Dependency } from '../../db/types';

export function listServices(req: Request, res: Response): void {
  try {
    const { team_id } = req.query;

    let query = `
      SELECT
        s.*,
        t.id as team_id,
        t.name as team_name,
        t.description as team_description,
        t.created_at as team_created_at,
        t.updated_at as team_updated_at
      FROM services s
      JOIN teams t ON s.team_id = t.id
    `;
    const params: string[] = [];

    if (team_id && typeof team_id === 'string') {
      query += ' WHERE s.team_id = ?';
      params.push(team_id);
    }

    query += ' ORDER BY s.name ASC';

    const rows = db.prepare(query).all(...params) as (Service & {
      team_name: string;
      team_description: string | null;
      team_created_at: string;
      team_updated_at: string;
    })[];

    // Get dependencies for each service to compute health status
    const servicesWithHealth = rows.map((row) => {
      const dependencies = db
        .prepare('SELECT * FROM dependencies WHERE service_id = ?')
        .all(row.id) as Dependency[];

      // Compute overall health status
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
        health: {
          status: healthStatus,
          healthy_count: healthyCount,
          unhealthy_count: unhealthyCount,
          total_dependencies: totalCount,
        },
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
