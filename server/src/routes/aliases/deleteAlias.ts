import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AuthorizationService } from '../../auth/authorizationService';
import { sendErrorResponse } from '../../utils/errors';

export function deleteAlias(req: Request, res: Response): void {
  try {
    const { id } = req.params;
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

    stores.aliases.delete(id);
    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'deleting alias');
  }
}
