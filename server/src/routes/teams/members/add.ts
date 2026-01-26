import { Request, Response } from 'express';
import { getStores } from '../../../stores';
import { TeamMemberRole } from '../../../db/types';

export function addMember(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const { user_id, role = 'member' } = req.body;
    const stores = getStores();

    // Validate team exists
    if (!stores.teams.exists(id)) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Validate user_id
    if (!user_id || typeof user_id !== 'string') {
      res.status(400).json({ error: 'user_id is required' });
      return;
    }

    // Validate user exists
    const user = stores.users.findById(user_id);
    if (!user) {
      res.status(400).json({ error: 'User not found' });
      return;
    }

    // Validate role
    const validRoles: TeamMemberRole[] = ['lead', 'member'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
      return;
    }

    // Check if already a member
    if (stores.teams.isMember(id, user_id)) {
      res.status(409).json({ error: 'User is already a member of this team' });
      return;
    }

    const member = stores.teams.addMember(id, user_id, role);

    res.status(201).json({
      team_id: id,
      user_id,
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
    res.status(500).json({
      error: 'Failed to add team member',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
