import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { validateExternalServiceCreate } from '../../utils/validation';
import { ValidationError, formatError, getErrorStatusCode } from '../../utils/errors';
import { auditFromRequest } from '../../services/audit/AuditLogService';

export function createExternalService(req: Request, res: Response): void {
  try {
    const stores = getStores();

    const validated = validateExternalServiceCreate(req.body);

    // Verify team exists
    const team = stores.teams.findById(validated.team_id);
    if (!team) {
      throw new ValidationError('Team not found', 'team_id');
    }

    const service = stores.services.create({
      name: validated.name,
      team_id: validated.team_id,
      health_endpoint: '',
      description: validated.description,
      is_external: true,
    });

    auditFromRequest(req, 'external_service.created', 'external_service', service.id, {
      name: service.name,
      teamId: service.team_id,
    });

    res.status(201).json({
      id: service.id,
      name: service.name,
      description: service.description ?? null,
      team_id: service.team_id,
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
      },
      created_at: service.created_at,
      updated_at: service.updated_at,
    });
  } catch (error) {
    console.error('Error creating external service:', error);
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
