import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AuthorizationService } from '../../auth/authorizationService';
import { auditFromRequest } from '../../services/audit/AuditLogService';
import { sendErrorResponse } from '../../utils/errors';

export function deleteOverride(req: Request, res: Response): void {
  try {
    const { id } = req.params;

    // Check permissions: admin or team lead of the dependency's owning service's team
    const authResult = AuthorizationService.checkDependencyTeamLeadAccess(req.user!, id);
    if (!authResult.authorized) {
      res.status(authResult.statusCode!).json({ error: authResult.error });
      return;
    }

    const stores = getStores();
    const updated = stores.dependencies.updateOverrides(id, {
      contact_override: null,
      impact_override: null,
    });

    if (!updated) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    auditFromRequest(req, 'dependency_override.cleared', 'dependency', id);

    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'clearing dependency overrides');
  }
}
