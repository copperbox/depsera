import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';
import { auditFromRequest } from '../../services/audit/AuditLogService';

export function deleteTeam(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    // Check if team exists
    const team = stores.teams.findById(id);
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Check for services
    const serviceCount = stores.teams.getServiceCount(id);

    if (serviceCount > 0) {
      res.status(409).json({
        error: 'Cannot delete team with existing services',
        service_count: serviceCount,
      });
      return;
    }

    // Delete team (cascades to team_members)
    stores.teams.delete(id);

    auditFromRequest(req, 'team.deleted', 'team', id, {
      name: team.name,
    });

    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'deleting team');
  }
}
