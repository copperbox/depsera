import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AuthorizationService } from '../../auth/authorizationService';
import { sendErrorResponse } from '../../utils/errors';

export function createAlias(req: Request, res: Response): void {
  try {
    const { alias, canonical_name } = req.body;

    if (!alias || typeof alias !== 'string') {
      res.status(400).json({ error: 'alias is required and must be a string' });
      return;
    }

    if (!canonical_name || typeof canonical_name !== 'string') {
      res.status(400).json({ error: 'canonical_name is required and must be a string' });
      return;
    }

    // Check permissions: admin or team lead of a team with a service reporting this dependency
    const authResult = AuthorizationService.checkAliasAccess(req.user!, alias.trim());
    if (!authResult.authorized) {
      res.status(authResult.statusCode!).json({ error: authResult.error });
      return;
    }

    const stores = getStores();
    const existing = stores.aliases.findByAlias(alias.trim());
    if (existing) {
      res.status(409).json({ error: `Alias "${alias.trim()}" already exists` });
      return;
    }

    const created = stores.aliases.create(alias.trim(), canonical_name.trim());
    res.status(201).json(created);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'creating alias');
  }
}
