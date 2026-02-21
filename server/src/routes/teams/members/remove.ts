import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { sendErrorResponse } from '../../../utils/errors';
import { auditFromRequest } from '../../../services/audit/AuditLogService';

export function removeMember(req: Request, res: Response): void {
  try {
    const { id, userId } = req.params;
    const stores = getStores();

    // Validate team exists
    if (!stores.teams.exists(id)) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Validate membership exists
    if (!stores.teams.isMember(id, userId)) {
      res.status(404).json({ error: 'Team member not found' });
      return;
    }

    stores.teams.removeMember(id, userId);

    auditFromRequest(req, 'team.member_removed', 'team', id, {
      memberId: userId,
    });

    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'removing team member');
  }
}
