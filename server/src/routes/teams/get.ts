import { Request, Response } from 'express';
import { getStores } from '../../stores';

export function getTeam(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    const team = stores.teams.findById(id);

    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Get members with user details
    const members = stores.teams.findMembers(id);

    const formattedMembers = members.map((m) => ({
      team_id: m.team_id,
      user_id: m.user_id,
      role: m.role,
      created_at: m.created_at,
      user: {
        id: m.user_id,
        email: m.user_email,
        name: m.user_name,
      },
    }));

    // Get services
    const services = stores.services.findByTeamId(id);

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
