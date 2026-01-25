import { Request, Response } from 'express';
import db from '../../db';
import { Dependency, DependencyAssociation } from '../../db/types';

export function deleteAssociation(req: Request, res: Response): void {
  try {
    const { dependencyId, serviceId } = req.params;

    // Verify dependency exists
    const dependency = db.prepare(`
      SELECT * FROM dependencies WHERE id = ?
    `).get(dependencyId) as Dependency | undefined;

    if (!dependency) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    // Find the association
    const association = db.prepare(`
      SELECT * FROM dependency_associations
      WHERE dependency_id = ? AND linked_service_id = ?
    `).get(dependencyId, serviceId) as DependencyAssociation | undefined;

    if (!association) {
      res.status(404).json({ error: 'Association not found' });
      return;
    }

    // Delete the association
    db.prepare(`
      DELETE FROM dependency_associations WHERE id = ?
    `).run(association.id);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting association:', error);
    res.status(500).json({
      error: 'Failed to delete association',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
