import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

export function getAliases(_req: Request, res: Response): void {
  try {
    const aliases = getStores().aliases.findAll();
    res.json(aliases);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'fetching aliases');
  }
}
