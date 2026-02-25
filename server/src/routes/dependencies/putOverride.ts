import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AuthorizationService } from '../../auth/authorizationService';
import { auditFromRequest } from '../../services/audit/AuditLogService';
import { sendErrorResponse } from '../../utils/errors';

export function putOverride(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const { contact_override, impact_override } = req.body;

    // Validate: at least one override field must be provided
    if (contact_override === undefined && impact_override === undefined) {
      res.status(400).json({
        error: 'At least one of contact_override or impact_override must be provided',
      });
      return;
    }

    // Validate contact_override: must be an object or null if provided
    if (contact_override !== undefined && contact_override !== null) {
      if (typeof contact_override !== 'object' || Array.isArray(contact_override)) {
        res.status(400).json({
          error: 'contact_override must be an object or null',
        });
        return;
      }
    }

    // Validate impact_override: must be a string or null if provided
    if (impact_override !== undefined && impact_override !== null) {
      if (typeof impact_override !== 'string') {
        res.status(400).json({
          error: 'impact_override must be a string or null',
        });
        return;
      }
    }

    // Check permissions: admin or team lead of the dependency's owning service's team
    const authResult = AuthorizationService.checkDependencyTeamLeadAccess(req.user!, id);
    if (!authResult.authorized) {
      res.status(authResult.statusCode!).json({ error: authResult.error });
      return;
    }

    const stores = getStores();
    const updated = stores.dependencies.updateOverrides(id, {
      contact_override:
        contact_override !== undefined
          ? contact_override === null
            ? null
            : JSON.stringify(contact_override)
          : undefined,
      impact_override: impact_override !== undefined ? impact_override : undefined,
    });

    if (!updated) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    auditFromRequest(req, 'dependency_override.updated', 'dependency', id, {
      contact_override: contact_override !== undefined ? contact_override : undefined,
      impact_override: impact_override !== undefined ? impact_override : undefined,
    });

    res.json(updated);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'updating dependency overrides');
  }
}
