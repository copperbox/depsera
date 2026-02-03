import { Request, Response } from 'express';
import { getStores } from '../../stores';

export function me(req: Request, res: Response): void {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    // Get team memberships (same pattern as existing /users/me)
    const stores = getStores();
    const memberships = stores.teams.getMembershipsByUserId(req.user.id);

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
          name: m.team_name,
          description: m.team_description,
        },
      })),
      permissions: {
        canManageUsers: isAdmin,
        canManageTeams: isAdmin,
        canManageServices: isAdmin || isTeamLead,
      },
    });
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      error: 'Failed to fetch user profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
