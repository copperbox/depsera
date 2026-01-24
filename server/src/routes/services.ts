import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from '../db';
import {
  Service,
  CreateServiceInput,
  UpdateServiceInput,
  Team,
  Dependency,
} from '../db/types';

const router = Router();

// URL validation helper
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Minimum polling interval in seconds
const MIN_POLLING_INTERVAL = 10;
const DEFAULT_POLLING_INTERVAL = 30;

// GET /api/services - List all services
router.get('/', (req: Request, res: Response) => {
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
});

// GET /api/services/:id - Get service details with dependencies
router.get('/:id', (req: Request, res: Response) => {
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
});

// POST /api/services - Create new service
router.post('/', (req: Request, res: Response) => {
  try {
    const input: CreateServiceInput = req.body;

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
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(input.team_id) as Team | undefined;
    if (!team) {
      res.status(400).json({ error: 'Team not found' });
      return;
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO services (id, name, team_id, health_endpoint, metrics_endpoint, polling_interval, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      input.name.trim(),
      input.team_id,
      input.health_endpoint,
      input.metrics_endpoint || null,
      pollingInterval,
      now,
      now
    );

    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Service;

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
});

// PUT /api/services/:id - Update service
router.put('/:id', (req: Request, res: Response) => {
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
});

// DELETE /api/services/:id - Delete service
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if service exists
    const service = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Service | undefined;
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    // Delete service (cascades to dependencies and associations)
    db.prepare('DELETE FROM services WHERE id = ?').run(id);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({
      error: 'Failed to delete service',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
