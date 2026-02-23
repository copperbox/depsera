import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { validateExternalServiceUpdate } from '../../utils/validation';
import { NotFoundError, ValidationError, formatError, getErrorStatusCode } from '../../utils/errors';
import { auditFromRequest } from '../../services/audit/AuditLogService';

export function updateExternalService(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    // Check if service exists and is external
    const existing = stores.services.findById(id);
    if (!existing || existing.is_external !== 1) {
      throw new NotFoundError('External service');
    }

    const validated = validateExternalServiceUpdate(req.body);
    if (!validated) {
      throw new ValidationError('No valid fields to update');
    }

    stores.services.update(id, {
      name: validated.name,
      description: validated.description,
    });

    auditFromRequest(req, 'external_service.updated', 'external_service', id, {
      name: existing.name,
    });

    // Return updated service
    const updated = stores.services.findByIdWithTeam(id);
    /* istanbul ignore if -- Unreachable: service was just updated */
    if (!updated) {
      throw new NotFoundError('External service');
    }

    res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description ?? null,
      team_id: updated.team_id,
      team: {
        id: updated.team_id,
        name: updated.team_name,
        description: updated.team_description ?? null,
      },
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    });
  } catch (error) {
    console.error('Error updating external service:', error);
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
