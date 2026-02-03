import { Request, Response } from 'express';
import { getStores } from '../../stores';

export function getAliases(_req: Request, res: Response): void {
  try {
    const aliases = getStores().aliases.findAll();
    res.json(aliases);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    console.error('Error fetching aliases:', error);
    res.status(500).json({
      error: 'Failed to fetch aliases',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
