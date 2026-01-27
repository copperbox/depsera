import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { validateTeamMemberAdd } from '../../../utils/validation';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  formatError,
  getErrorStatusCode,
} from '../../../utils/errors';

export function addMember(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    // Validate team exists
    if (!stores.teams.exists(id)) {
      throw new NotFoundError('Team');
    }

    // Validate input using centralized validation
    const validated = validateTeamMemberAdd(req.body);

    // Validate user exists
    const user = stores.users.findById(validated.user_id);
    if (!user) {
      throw new ValidationError('User not found', 'user_id');
    }

    // Check if already a member
    if (stores.teams.isMember(id, validated.user_id)) {
      throw new ConflictError('User is already a member of this team');
    }

    const member = stores.teams.addMember(id, validated.user_id, validated.role);

    res.status(201).json({
      team_id: id,
      user_id: validated.user_id,
      role: member.role,
      created_at: member.created_at,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: user.is_active,
      },
    });
  } catch (error) {
    console.error('Error adding team member:', error);
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
