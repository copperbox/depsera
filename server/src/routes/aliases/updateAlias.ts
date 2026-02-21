import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

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
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'updating alias');
  }
}
