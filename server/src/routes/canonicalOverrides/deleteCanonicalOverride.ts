import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AuthorizationService } from '../../auth/authorizationService';
import { auditFromRequest } from '../../services/audit/AuditLogService';
import { sendErrorResponse } from '../../utils/errors';

export function deleteCanonicalOverride(req: Request, res: Response): void {
  try {
    const { canonicalName } = req.params;

    // Check permissions: admin or team lead of a team with a service reporting this canonical dep
    const authResult = AuthorizationService.checkCanonicalOverrideAccess(
      req.user!,
      canonicalName,
    );
    if (!authResult.authorized) {
      res.status(authResult.statusCode!).json({ error: authResult.error });
      return;
    }

    const deleted = getStores().canonicalOverrides.delete(canonicalName);

    if (!deleted) {
      res.status(404).json({ error: 'Canonical override not found' });
      return;
    }

    auditFromRequest(req, 'canonical_override.deleted', 'canonical_override', canonicalName, {
      canonical_name: canonicalName,
    });

    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'deleting canonical override');
  }
}
