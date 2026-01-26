import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AssociationType } from '../../db/types';

const VALID_ASSOCIATION_TYPES: AssociationType[] = ['api_call', 'database', 'message_queue', 'cache', 'other'];

export function createAssociation(req: Request, res: Response): void {
  try {
    const { dependencyId } = req.params;
    const { linked_service_id, association_type } = req.body;
    const stores = getStores();

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
    const dependency = stores.dependencies.findById(dependencyId);

    if (!dependency) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    // Verify linked service exists
    const linkedService = stores.services.findById(linked_service_id);

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
    const existingAssociations = stores.associations.findByDependencyId(dependencyId);
    const existing = existingAssociations.find(a => a.linked_service_id === linked_service_id);

    if (existing) {
      // If it was dismissed, reactivate it
      if (existing.is_dismissed) {
        stores.associations.reactivateDismissed(existing.id, association_type);

        const updated = stores.associations.findById(existing.id)!;

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
    const association = stores.associations.create({
      dependency_id: dependencyId,
      linked_service_id,
      association_type,
      is_auto_suggested: false,
    });

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
