import { Request, Response } from 'express';
import db from '../../../db';
import { Team, TeamMember } from '../../../db/types';

export function removeMember(req: Request, res: Response): void {
  try {
    const { id, userId } = req.params;

    // Validate team exists
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Team | undefined;
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Validate membership exists
    const member = db
      .prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?')
      .get(id, userId) as TeamMember | undefined;

    if (!member) {
      res.status(404).json({ error: 'Team member not found' });
      return;
    }

    db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(id, userId);

    res.status(204).send();
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({
      error: 'Failed to remove team member',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
