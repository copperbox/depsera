import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

export function getCanonicalNames(_req: Request, res: Response): void {
  try {
    const names = getStores().aliases.getCanonicalNames();
    res.json(names);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'fetching canonical names');
  }
}
