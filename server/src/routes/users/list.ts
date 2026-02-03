import { Request, Response } from 'express';
import { getStores } from '../../stores';

export function listUsers(_req: Request, res: Response): void {
  try {
    const stores = getStores();
    const users = stores.users.findAll();

    res.json(users);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    console.error('Error listing users:', error);
    res.status(500).json({
      error: 'Failed to list users',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
