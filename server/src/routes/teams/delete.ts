import { Request, Response } from 'express';
import { getStores } from '../../stores';

export function deleteTeam(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    // Check if team exists
    if (!stores.teams.exists(id)) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Check for services
    const serviceCount = stores.teams.getServiceCount(id);

    if (serviceCount > 0) {
      res.status(409).json({
        error: 'Cannot delete team with existing services',
        service_count: serviceCount,
      });
      return;
    }

    // Delete team (cascades to team_members)
    stores.teams.delete(id);

    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    console.error('Error deleting team:', error);
    res.status(500).json({
      error: 'Failed to delete team',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
