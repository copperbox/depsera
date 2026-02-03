import { Request, Response } from 'express';
import { getStores } from '../../stores';
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
    const stores = getStores();

    const user = stores.users.findById(id);

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get team memberships
    const memberships = stores.teams.getMembershipsByUserId(id);

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
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    console.error('Error getting user:', error);
    res.status(500).json({
      error: 'Failed to get user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
