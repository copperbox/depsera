import { Request, Response } from 'express';
import db from '../../db';
import { UpdateTeamInput, Team } from '../../db/types';

export function updateTeam(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const input: UpdateTeamInput = req.body;

    // Check if team exists
    const existingTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Team | undefined;
    if (!existingTeam) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    // Validate fields if provided
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || input.name.trim() === '') {
        res.status(400).json({ error: 'name must be a non-empty string' });
        return;
      }

      // Check for duplicate name (excluding current team)
      const duplicate = db
        .prepare('SELECT id FROM teams WHERE name = ? AND id != ?')
        .get(input.name.trim(), id) as { id: string } | undefined;

      if (duplicate) {
        res.status(409).json({ error: 'A team with this name already exists' });
        return;
      }
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: (string | null)[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name.trim());
    }
    if (input.description !== undefined) {
      updates.push('description = ?');
      values.push(input.description || null);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);

    db.prepare(`UPDATE teams SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Fetch updated team
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Team;

    const memberCount = db
      .prepare('SELECT COUNT(*) as count FROM team_members WHERE team_id = ?')
      .get(id) as { count: number };

    const serviceCount = db
      .prepare('SELECT COUNT(*) as count FROM services WHERE team_id = ?')
      .get(id) as { count: number };

    res.json({
      ...team,
      member_count: memberCount.count,
      service_count: serviceCount.count,
    });
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({
      error: 'Failed to update team',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
