import { Request, Response } from 'express';
import { getStores } from '../../stores';

export function updateAlias(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const { canonical_name } = req.body;

    if (!canonical_name || typeof canonical_name !== 'string') {
      res.status(400).json({ error: 'canonical_name is required and must be a string' });
      return;
    }

    const updated = getStores().aliases.update(id, canonical_name.trim());
    if (!updated) {
      res.status(404).json({ error: 'Alias not found' });
      return;
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating alias:', error);
    res.status(500).json({
      error: 'Failed to update alias',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
