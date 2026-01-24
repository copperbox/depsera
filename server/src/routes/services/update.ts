import { Request, Response } from 'express';
import db from '../../db';
import { UpdateServiceInput, Service, Team, Dependency } from '../../db/types';
import { isValidUrl, MIN_POLLING_INTERVAL } from './validation';

export function updateService(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const input: UpdateServiceInput = req.body;

    // Check if service exists
    const existingService = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Service | undefined;
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
      const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(input.team_id) as Team | undefined;
      if (!team) {
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

    // Build update query dynamically
    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name.trim());
    }
    if (input.team_id !== undefined) {
      updates.push('team_id = ?');
      values.push(input.team_id);
    }
    if (input.health_endpoint !== undefined) {
      updates.push('health_endpoint = ?');
      values.push(input.health_endpoint);
    }
    if (input.metrics_endpoint !== undefined) {
      updates.push('metrics_endpoint = ?');
      values.push(input.metrics_endpoint || null);
    }
    if (input.polling_interval !== undefined) {
      updates.push('polling_interval = ?');
      values.push(input.polling_interval);
    }
    if (input.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(input.is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    db.prepare(`UPDATE services SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Fetch updated service with team and health
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
      .get(id) as Service & {
      team_name: string;
      team_description: string | null;
      team_created_at: string;
      team_updated_at: string;
    };

    const dependencies = db
      .prepare('SELECT * FROM dependencies WHERE service_id = ?')
      .all(id) as Dependency[];

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
