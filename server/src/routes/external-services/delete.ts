import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';
import { auditFromRequest } from '../../services/audit/AuditLogService';

export function deleteExternalService(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    // Check if service exists and is external
    const service = stores.services.findById(id);
    if (!service || service.is_external !== 1) {
      res.status(404).json({ error: 'External service not found' });
      return;
    }

    // Delete service (cascades to dependency_associations via FK)
    stores.services.delete(id);

    auditFromRequest(req, 'external_service.deleted', 'external_service', id, {
      name: service.name,
      teamId: service.team_id,
    });

    res.status(204).send();
  } catch (error) {
    sendErrorResponse(res, error, 'deleting external service');
  }
}
