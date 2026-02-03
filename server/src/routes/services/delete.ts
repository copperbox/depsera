import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { HealthPollingService } from '../../services/polling';

export function deleteService(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    // Check if service exists
    if (!stores.services.exists(id)) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    // Stop polling for this service
    HealthPollingService.getInstance().stopService(id);

    // Delete service (cascades to dependencies and associations)
    stores.services.delete(id);

    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    console.error('Error deleting service:', error);
    res.status(500).json({
      error: 'Failed to delete service',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
