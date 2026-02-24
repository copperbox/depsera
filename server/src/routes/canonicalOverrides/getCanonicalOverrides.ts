import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

export function getCanonicalOverrides(_req: Request, res: Response): void {
  try {
    const overrides = getStores().canonicalOverrides.findAll();
    res.json(overrides);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'fetching canonical overrides');
  }
}
