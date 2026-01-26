import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { CreateTeamInput } from '../../db/types';

export function createTeam(req: Request, res: Response): void {
  try {
    const input: CreateTeamInput = req.body;
    const stores = getStores();

    // Validate required fields
    if (!input.name || typeof input.name !== 'string' || input.name.trim() === '') {
      res.status(400).json({ error: 'name is required and must be a non-empty string' });
      return;
    }

    // Check for duplicate name
    const existing = stores.teams.findByName(input.name.trim());

    if (existing) {
      res.status(409).json({ error: 'A team with this name already exists' });
      return;
    }

    const team = stores.teams.create({
      name: input.name.trim(),
      description: input.description || null,
    });

    res.status(201).json({
      ...team,
      members: [],
      services: [],
      member_count: 0,
      service_count: 0,
    });
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({
      error: 'Failed to create team',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
