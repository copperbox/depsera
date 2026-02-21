import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { User } from '../../db/types';
import { sendErrorResponse } from '../../utils/errors';

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
    const stores = getStores();
    // In a real app, this would come from the authenticated session/token
    // For now, we'll use a header or default to the first admin user
    const userId = req.headers['x-user-id'] as string | undefined;

    let user: User | undefined;

    if (userId) {
      user = stores.users.findById(userId);
    }

    // Fallback to first active admin for development
    if (!user) {
      const activeUsers = stores.users.findActive();
      user = activeUsers.find(u => u.role === 'admin');
    }

    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    // Get team memberships
    const memberships = stores.teams.getMembershipsByUserId(user.id);

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
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'getting current user');
  }
}
