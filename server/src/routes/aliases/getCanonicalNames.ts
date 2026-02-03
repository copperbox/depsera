import { Request, Response } from 'express';
import { getStores } from '../../stores';

export function getCanonicalNames(_req: Request, res: Response): void {
  try {
    const names = getStores().aliases.getCanonicalNames();
    res.json(names);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    console.error('Error fetching canonical names:', error);
    res.status(500).json({
      error: 'Failed to fetch canonical names',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
