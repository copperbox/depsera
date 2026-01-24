import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from '../../db';
import { CreateTeamInput, Team } from '../../db/types';

export function createTeam(req: Request, res: Response): void {
  try {
    const input: CreateTeamInput = req.body;

    // Validate required fields
    if (!input.name || typeof input.name !== 'string' || input.name.trim() === '') {
      res.status(400).json({ error: 'name is required and must be a non-empty string' });
      return;
    }

    // Check for duplicate name
    const existing = db
      .prepare('SELECT id FROM teams WHERE name = ?')
      .get(input.name.trim()) as { id: string } | undefined;

    if (existing) {
      res.status(409).json({ error: 'A team with this name already exists' });
      return;
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO teams (id, name, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `
    ).run(id, input.name.trim(), input.description || null, now, now);

    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id) as Team;

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
