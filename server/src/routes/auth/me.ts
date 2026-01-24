import { Request, Response } from 'express';
import db from '../../db';

interface TeamMembership {
  team_id: string;
  role: string;
  name: string;
  description: string | null;
}

export function me(req: Request, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    // Get team memberships (same pattern as existing /users/me)
    const memberships = db
      .prepare(`
        SELECT tm.team_id, tm.role, t.name, t.description
        FROM team_members tm
        JOIN teams t ON tm.team_id = t.id
        WHERE tm.user_id = ?
        ORDER BY t.name ASC
      `)
      .all(req.user.id) as TeamMembership[];

    const isAdmin = req.user.role === 'admin';
    const isTeamLead = memberships.some((m) => m.role === 'lead');

    res.json({
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      is_active: Boolean(req.user.is_active),
      teams: memberships.map((m) => ({
        team_id: m.team_id,
        role: m.role,
        team: {
          id: m.team_id,
          name: m.name,
          description: m.description,
        },
      })),
      permissions: {
        canManageUsers: isAdmin,
        canManageTeams: isAdmin,
        canManageServices: isAdmin || isTeamLead,
      },
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      error: 'Failed to fetch user profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
