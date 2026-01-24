import { Request, Response } from 'express';
import db from '../../../db';
import { Team, TeamMember, TeamMemberRole, User } from '../../../db/types';

export function addMember(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const { user_id, role = 'member' } = req.body;

    // Validate team exists
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Team | undefined;
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Validate user_id
    if (!user_id || typeof user_id !== 'string') {
      res.status(400).json({ error: 'user_id is required' });
      return;
    }

    // Validate user exists
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id) as User | undefined;
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
    const existing = db
      .prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?')
      .get(id, user_id) as TeamMember | undefined;

    if (existing) {
      res.status(409).json({ error: 'User is already a member of this team' });
      return;
    }

    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO team_members (team_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?)
    `
    ).run(id, user_id, role, now);

    res.status(201).json({
      team_id: id,
      user_id,
      role,
      created_at: now,
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
