import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { UpdateTeamInput } from '../../db/types';

export function updateTeam(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const input: UpdateTeamInput = req.body;
    const stores = getStores();

    // Check if team exists
    const existingTeam = stores.teams.findById(id);
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
      const duplicate = stores.teams.findByName(input.name.trim());

      if (duplicate && duplicate.id !== id) {
        res.status(409).json({ error: 'A team with this name already exists' });
        return;
      }
    }

    // Check if there are any valid fields to update
    if (input.name === undefined && input.description === undefined) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    // Update via repository
    const team = stores.teams.update(id, {
      name: input.name?.trim(),
      description: input.description,
    })!;

    res.json({
      ...team,
      member_count: stores.teams.getMemberCount(id),
      service_count: stores.teams.getServiceCount(id),
    });
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({
      error: 'Failed to update team',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
