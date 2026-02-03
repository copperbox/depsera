import { Request, Response } from 'express';
import { getStores } from '../../stores';

export function deleteAlias(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const deleted = getStores().aliases.delete(id);

    if (!deleted) {
      res.status(404).json({ error: 'Alias not found' });
      return;
    }

    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    console.error('Error deleting alias:', error);
    res.status(500).json({
      error: 'Failed to delete alias',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
