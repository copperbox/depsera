import { Request, Response } from 'express';
import { getStores } from '../../../stores';

export function removeMember(req: Request, res: Response): void {
  try {
    const { id, userId } = req.params;
    const stores = getStores();

    // Validate team exists
    if (!stores.teams.exists(id)) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Validate membership exists
    if (!stores.teams.isMember(id, userId)) {
      res.status(404).json({ error: 'Team member not found' });
      return;
    }

    stores.teams.removeMember(id, userId);

    res.status(204).send();
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({
      error: 'Failed to remove team member',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
