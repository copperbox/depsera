import { Request, Response } from 'express';
import { getStores } from '../../stores';

export function deleteAssociation(req: Request, res: Response): void {
  try {
    const { dependencyId, serviceId } = req.params;
    const stores = getStores();

    // Verify dependency exists
    if (!stores.dependencies.exists(dependencyId)) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    // Find the association
    const associations = stores.associations.findByDependencyId(dependencyId);
    const association = associations.find(a => a.linked_service_id === serviceId);

    if (!association) {
      res.status(404).json({ error: 'Association not found' });
      return;
    }

    // Delete the association
    stores.associations.delete(association.id);

    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    console.error('Error deleting association:', error);
    res.status(500).json({
      error: 'Failed to delete association',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
