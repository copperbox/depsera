import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { validateTeamCreate } from '../../utils/validation';
import { formatNewTeam } from '../formatters';
import { ConflictError, formatError, getErrorStatusCode } from '../../utils/errors';
import { auditFromRequest } from '../../services/audit/AuditLogService';

export function createTeam(req: Request, res: Response): void {
  try {
    const stores = getStores();

    // Validate input using centralized validation
    const validated = validateTeamCreate(req.body);

    // Check for duplicate name
    const existing = stores.teams.findByName(validated.name);
    if (existing) {
      throw new ConflictError('A team with this name already exists');
    }

    // Check for duplicate key
    const existingKey = stores.teams.findByKey(validated.key);
    if (existingKey) {
      throw new ConflictError('A team with this key already exists');
    }

    const team = stores.teams.create({
      name: validated.name,
      key: validated.key,
      description: validated.description,
      contact: validated.contact,
    });

    auditFromRequest(req, 'team.created', 'team', team.id, {
      name: team.name,
    });

    res.status(201).json(formatNewTeam(team));
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
