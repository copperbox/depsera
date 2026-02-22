import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { HealthPollingService } from '../../services/polling';
import { sendErrorResponse } from '../../utils/errors';
import { auditFromRequest } from '../../services/audit/AuditLogService';

export function deleteService(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    // Check if service exists
    const service = stores.services.findById(id);
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    // Stop polling for this service
    HealthPollingService.getInstance().stopService(id);

    // Delete service (cascades to dependencies and associations)
    stores.services.delete(id);

    auditFromRequest(req, 'service.deleted', 'service', id, {
      name: service.name,
      teamId: service.team_id,
    });

    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'deleting service');
  }
}
