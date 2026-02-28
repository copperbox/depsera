import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AuthorizationService } from '../../auth/authorizationService';
import { auditFromRequest } from '../../services/audit/AuditLogService';
import { sendErrorResponse } from '../../utils/errors';

export function deleteCanonicalOverride(req: Request, res: Response): void {
  try {
    const { canonicalName } = req.params;
    const { team_id } = req.query;
    const teamId = typeof team_id === 'string' ? team_id : undefined;

    // Permission check: team-scoped requires team lead of that team; global uses existing check
    if (teamId) {
      const authResult = AuthorizationService.checkTeamLeadAccess(req.user!, teamId);
      if (!authResult.authorized) {
        res.status(authResult.statusCode!).json({ error: authResult.error });
        return;
      }
    } else {
      const authResult = AuthorizationService.checkCanonicalOverrideAccess(
        req.user!,
        canonicalName,
      );
      if (!authResult.authorized) {
        res.status(authResult.statusCode!).json({ error: authResult.error });
        return;
      }
    }

    const stores = getStores();
    const deleted = teamId
      ? stores.canonicalOverrides.deleteByTeam(canonicalName, teamId)
      : stores.canonicalOverrides.delete(canonicalName);

    if (!deleted) {
      res.status(404).json({ error: 'Canonical override not found' });
      return;
    }

    auditFromRequest(req, 'canonical_override.deleted', 'canonical_override', canonicalName, {
      canonical_name: canonicalName,
      team_id: teamId ?? null,
    });

    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'deleting canonical override');
  }
}
