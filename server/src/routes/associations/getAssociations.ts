import { Request, Response } from 'express';
import db from '../../db';
import { Dependency, DependencyAssociation, Service } from '../../db/types';

interface AssociationWithService extends DependencyAssociation {
  linked_service: Service;
}

export function getAssociations(req: Request, res: Response): void {
  try {
    const { dependencyId } = req.params;

    // Verify dependency exists
    const dependency = db.prepare(`
      SELECT * FROM dependencies WHERE id = ?
    `).get(dependencyId) as Dependency | undefined;

    if (!dependency) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    // Get associations with linked service details
    const associations = db.prepare(`
      SELECT
        da.*,
        s.id as ls_id,
        s.name as ls_name,
        s.team_id as ls_team_id,
        s.health_endpoint as ls_health_endpoint,
        s.metrics_endpoint as ls_metrics_endpoint,
        s.polling_interval as ls_polling_interval,
        s.is_active as ls_is_active,
        s.created_at as ls_created_at,
        s.updated_at as ls_updated_at
      FROM dependency_associations da
      JOIN services s ON da.linked_service_id = s.id
      WHERE da.dependency_id = ?
        AND da.is_dismissed = 0
      ORDER BY da.created_at DESC
    `).all(dependencyId) as (DependencyAssociation & {
      ls_id: string;
      ls_name: string;
      ls_team_id: string;
      ls_health_endpoint: string;
      ls_metrics_endpoint: string | null;
      ls_polling_interval: number;
      ls_is_active: number;
      ls_created_at: string;
      ls_updated_at: string;
    })[];

    // Transform to include nested linked_service object
    const result: AssociationWithService[] = associations.map(row => ({
      id: row.id,
      dependency_id: row.dependency_id,
      linked_service_id: row.linked_service_id,
      association_type: row.association_type,
      is_auto_suggested: row.is_auto_suggested,
      confidence_score: row.confidence_score,
      is_dismissed: row.is_dismissed,
      created_at: row.created_at,
      linked_service: {
        id: row.ls_id,
        name: row.ls_name,
        team_id: row.ls_team_id,
        health_endpoint: row.ls_health_endpoint,
        metrics_endpoint: row.ls_metrics_endpoint,
        polling_interval: row.ls_polling_interval,
        is_active: row.ls_is_active,
        created_at: row.ls_created_at,
        updated_at: row.ls_updated_at,
      },
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching associations:', error);
    res.status(500).json({
      error: 'Failed to fetch associations',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
