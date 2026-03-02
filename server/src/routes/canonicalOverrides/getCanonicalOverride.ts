import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { sendErrorResponse } from '../../utils/errors';

export function getCanonicalOverride(req: Request, res: Response): void {
  try {
    const { canonicalName } = req.params;
    const { team_id } = req.query;
    const stores = getStores();

    const override = typeof team_id === 'string'
      ? stores.canonicalOverrides.findByTeamAndCanonicalName(team_id, canonicalName)
      : stores.canonicalOverrides.findByCanonicalName(canonicalName);

    if (!override) {
      res.status(404).json({ error: 'Canonical override not found' });
      return;
    }

    res.json(override);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'fetching canonical override');
  }
}
