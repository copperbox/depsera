import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

export function getCanonicalOverrides(req: Request, res: Response): void {
  try {
    const { team_id } = req.query;
    const teamId = typeof team_id === 'string' ? team_id : undefined;
    const overrides = getStores().canonicalOverrides.findAll(teamId);
    res.json(overrides);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'fetching canonical overrides');
  }
}
