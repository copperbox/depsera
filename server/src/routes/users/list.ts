import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

export function listUsers(_req: Request, res: Response): void {
  try {
    const stores = getStores();
    const users = stores.users.findAll();

    res.json(users);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'listing users');
  }
}
