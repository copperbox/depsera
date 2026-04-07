import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AuthorizationService } from '../../auth/authorizationService';
import { sendErrorResponse } from '../../utils/errors';

export function confirmAssociation(req: Request, res: Response): void {
  try {
    const { depId, assocId } = req.params;
    const stores = getStores();

    // Verify user has team access to the dependency's owning service
    const authResult = AuthorizationService.checkDependencyTeamAccess(req.user!, depId);
    if (!authResult.authorized) {
      res.status(authResult.statusCode!).json({ error: authResult.error });
      return;
    }

    // Verify association exists and belongs to this dependency
    const association = stores.associations.findById(assocId);
    if (!association || association.dependency_id !== depId) {
      res.status(404).json({ error: 'Association not found' });
      return;
    }

    stores.associations.confirm(assocId);

    res.status(200).json({ success: true });
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'confirming association');
  }
}
