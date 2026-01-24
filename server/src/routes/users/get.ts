import { Request, Response } from 'express';
import db from '../../db';
import { User } from '../../db/types';

interface UserWithTeams extends User {
  teams: {
    team_id: string;
    role: string;
    team: {
      id: string;
      name: string;
      description: string | null;
    };
  }[];
}

export function getUser(req: Request, res: Response): void {
  try {
    const { id } = req.params;

    const user = db
      .prepare('SELECT id, email, name, role, is_active, created_at, updated_at FROM users WHERE id = ?')
      .get(id) as User | undefined;

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get team memberships
    const memberships = db
      .prepare(
        `
        SELECT
          tm.team_id,
          tm.role,
          t.id as team_id,
          t.name as team_name,
          t.description as team_description
        FROM team_members tm
        JOIN teams t ON tm.team_id = t.id
        WHERE tm.user_id = ?
        ORDER BY t.name ASC
      `
      )
      .all(id) as {
      team_id: string;
      role: string;
      team_name: string;
      team_description: string | null;
    }[];

    const userWithTeams: UserWithTeams = {
      ...user,
      teams: memberships.map((m) => ({
        team_id: m.team_id,
        role: m.role,
        team: {
          id: m.team_id,
          name: m.team_name,
          description: m.team_description,
        },
      })),
    };

    res.json(userWithTeams);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({
      error: 'Failed to get user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
