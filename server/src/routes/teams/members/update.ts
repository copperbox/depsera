import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { TeamMemberRole } from '../../../db/types';
import { sendErrorResponse } from '../../../utils/errors';

export function updateMember(req: Request, res: Response): void {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;
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

    // Validate role
    if (!role) {
      res.status(400).json({ error: 'role is required' });
      return;
    }

    const validRoles: TeamMemberRole[] = ['lead', 'member'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
      return;
    }

    stores.teams.updateMemberRole(id, userId, role);

    // Get user details
    const user = stores.users.findById(userId)!;

    // Get member to retrieve created_at
    const members = stores.teams.findMembers(id);
    const member = members.find(m => m.user_id === userId)!;

    res.json({
      team_id: id,
      user_id: userId,
      role,
      created_at: member.created_at,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: user.is_active,
      },
    });
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'updating team member');
  }
}
