import { Request, Response } from 'express';
import db from '../../db';
import { Team, TeamMember, Service } from '../../db/types';

export function getTeam(req: Request, res: Response): void {
  try {
    const { id } = req.params;

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Team | undefined;

    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Get members with user details
    const members = db
      .prepare(
        `
        SELECT
          tm.team_id,
          tm.user_id,
          tm.role,
          tm.created_at,
          u.id as user_id,
          u.email as user_email,
          u.name as user_name,
          u.role as user_role,
          u.is_active as user_is_active
        FROM team_members tm
        JOIN users u ON tm.user_id = u.id
        WHERE tm.team_id = ?
        ORDER BY tm.role ASC, u.name ASC
      `
      )
      .all(id) as (TeamMember & {
      user_email: string;
      user_name: string;
      user_role: string;
      user_is_active: number;
    })[];

    const formattedMembers = members.map((m) => ({
      team_id: m.team_id,
      user_id: m.user_id,
      role: m.role,
      created_at: m.created_at,
      user: {
        id: m.user_id,
        email: m.user_email,
        name: m.user_name,
        role: m.user_role,
        is_active: m.user_is_active,
      },
    }));

    // Get services
    const services = db
      .prepare('SELECT * FROM services WHERE team_id = ? ORDER BY name ASC')
      .all(id) as Service[];

    res.json({
      ...team,
      members: formattedMembers,
      services,
    });
  } catch (error) {
    console.error('Error getting team:', error);
    res.status(500).json({
      error: 'Failed to get team',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
