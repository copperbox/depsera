import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AuthorizationService } from '../../auth/authorizationService';
import { sendErrorResponse } from '../../utils/errors';

export function updateAlias(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const { canonical_name } = req.body;

    if (!canonical_name || typeof canonical_name !== 'string') {
      res.status(400).json({ error: 'canonical_name is required and must be a string' });
      return;
    }

    const stores = getStores();
    const existing = stores.aliases.findById(id);
    if (!existing) {
      res.status(404).json({ error: 'Alias not found' });
      return;
    }

    // Check permissions: admin or team lead of a team with a service reporting this dependency
    const authResult = AuthorizationService.checkAliasAccess(req.user!, existing.alias);
    if (!authResult.authorized) {
      res.status(authResult.statusCode!).json({ error: authResult.error });
      return;
    }

    const updated = stores.aliases.update(id, canonical_name.trim());
    res.json(updated!);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'updating alias');
  }
}
