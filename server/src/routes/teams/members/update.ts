import { Request, Response } from 'express';
import db from '../../../db';
import { Team, TeamMember, TeamMemberRole, User } from '../../../db/types';

export function updateMember(req: Request, res: Response): void {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;

    // Validate team exists
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Team | undefined;
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Validate membership exists
    const member = db
      .prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?')
      .get(id, userId) as TeamMember | undefined;

    if (!member) {
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

    db.prepare('UPDATE team_members SET role = ? WHERE team_id = ? AND user_id = ?').run(
      role,
      id,
      userId
    );

    // Get user details
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User;

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
  } catch (error) {
    console.error('Error updating team member:', error);
    res.status(500).json({
      error: 'Failed to update team member',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
