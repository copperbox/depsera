import { Request, Response } from 'express';
import db from '../../db';
import { User } from '../../db/types';

interface UserProfile extends User {
  teams: {
    team_id: string;
    role: string;
    team: {
      id: string;
      name: string;
      description: string | null;
    };
  }[];
  permissions: {
    canManageUsers: boolean;
    canManageTeams: boolean;
    canManageServices: boolean;
  };
}

export function getCurrentUser(req: Request, res: Response): void {
  try {
    // In a real app, this would come from the authenticated session/token
    // For now, we'll use a header or default to the first admin user
    const userId = req.headers['x-user-id'] as string | undefined;

    let user: User | undefined;

    if (userId) {
      user = db
        .prepare('SELECT id, email, name, role, is_active, created_at, updated_at FROM users WHERE id = ?')
        .get(userId) as User | undefined;
    }

    // Fallback to first active admin for development
    if (!user) {
      user = db
        .prepare(
          'SELECT id, email, name, role, is_active, created_at, updated_at FROM users WHERE role = ? AND is_active = 1 LIMIT 1'
        )
        .get('admin') as User | undefined;
    }

    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
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
      .all(user.id) as {
      team_id: string;
      role: string;
      team_name: string;
      team_description: string | null;
    }[];

    const isAdmin = user.role === 'admin';
    const isTeamLead = memberships.some((m) => m.role === 'lead');

    const profile: UserProfile = {
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
      permissions: {
        canManageUsers: isAdmin,
        canManageTeams: isAdmin,
        canManageServices: isAdmin || isTeamLead,
      },
    };

    res.json(profile);
  } catch (error) {
    console.error('Error getting current user:', error);
    res.status(500).json({
      error: 'Failed to get current user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
