import { Request, Response } from 'express';
import db from '../../db';
import { Team } from '../../db/types';

export function deleteTeam(req: Request, res: Response): void {
  try {
    const { id } = req.params;

    // Check if team exists
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Team | undefined;
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Check for services
    const serviceCount = db
      .prepare('SELECT COUNT(*) as count FROM services WHERE team_id = ?')
      .get(id) as { count: number };

    if (serviceCount.count > 0) {
      res.status(409).json({
        error: 'Cannot delete team with existing services',
        service_count: serviceCount.count,
      });
      return;
    }

    // Delete team (cascades to team_members)
    db.prepare('DELETE FROM teams WHERE id = ?').run(id);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting team:', error);
    res.status(500).json({
      error: 'Failed to delete team',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
