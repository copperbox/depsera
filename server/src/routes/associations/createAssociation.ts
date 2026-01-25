import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from '../../db';
import { Dependency, Service, AssociationType, DependencyAssociation } from '../../db/types';

const VALID_ASSOCIATION_TYPES: AssociationType[] = ['api_call', 'database', 'message_queue', 'cache', 'other'];

export function createAssociation(req: Request, res: Response): void {
  try {
    const { dependencyId } = req.params;
    const { linked_service_id, association_type } = req.body;

    // Validate required fields
    if (!linked_service_id || typeof linked_service_id !== 'string') {
      res.status(400).json({ error: 'linked_service_id is required' });
      return;
    }

    if (!association_type || !VALID_ASSOCIATION_TYPES.includes(association_type)) {
      res.status(400).json({
        error: `association_type must be one of: ${VALID_ASSOCIATION_TYPES.join(', ')}`,
      });
      return;
    }

    // Verify dependency exists
    const dependency = db.prepare(`
      SELECT * FROM dependencies WHERE id = ?
    `).get(dependencyId) as Dependency | undefined;

    if (!dependency) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    // Verify linked service exists
    const linkedService = db.prepare(`
      SELECT * FROM services WHERE id = ?
    `).get(linked_service_id) as Service | undefined;

    if (!linkedService) {
      res.status(400).json({ error: 'Linked service not found' });
      return;
    }

    // Prevent linking to the same service that owns the dependency
    if (linked_service_id === dependency.service_id) {
      res.status(400).json({ error: 'Cannot link dependency to its own service' });
      return;
    }

    // Check if association already exists
    const existing = db.prepare(`
      SELECT * FROM dependency_associations
      WHERE dependency_id = ? AND linked_service_id = ?
    `).get(dependencyId, linked_service_id) as DependencyAssociation | undefined;

    if (existing) {
      // If it was dismissed, reactivate it
      if (existing.is_dismissed) {
        db.prepare(`
          UPDATE dependency_associations
          SET is_dismissed = 0, association_type = ?, is_auto_suggested = 0
          WHERE id = ?
        `).run(association_type, existing.id);

        const updated = db.prepare(`
          SELECT * FROM dependency_associations WHERE id = ?
        `).get(existing.id) as DependencyAssociation;

        res.json({
          ...updated,
          linked_service: linkedService,
        });
        return;
      }

      res.status(409).json({ error: 'Association already exists' });
      return;
    }

    // Create new association
    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO dependency_associations (
        id, dependency_id, linked_service_id, association_type,
        is_auto_suggested, confidence_score, is_dismissed, created_at
      ) VALUES (?, ?, ?, ?, 0, NULL, 0, ?)
    `).run(id, dependencyId, linked_service_id, association_type, now);

    const association = db.prepare(`
      SELECT * FROM dependency_associations WHERE id = ?
    `).get(id) as DependencyAssociation;

    res.status(201).json({
      ...association,
      linked_service: linkedService,
    });
  } catch (error) {
    console.error('Error creating association:', error);
    res.status(500).json({
      error: 'Failed to create association',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
