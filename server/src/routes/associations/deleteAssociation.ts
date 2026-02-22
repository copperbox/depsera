import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AuthorizationService } from '../../auth/authorizationService';
import { sendErrorResponse } from '../../utils/errors';

export function deleteAssociation(req: Request, res: Response): void {
  try {
    const { dependencyId, serviceId } = req.params;
    const stores = getStores();

    // Verify dependency exists
    if (!stores.dependencies.exists(dependencyId)) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    // Verify user has team access to the dependency's owning service
    const authResult = AuthorizationService.checkDependencyTeamAccess(req.user!, dependencyId);
    if (!authResult.authorized) {
      res.status(authResult.statusCode!).json({ error: authResult.error });
      return;
    }

    // Find the association
    const associations = stores.associations.findByDependencyId(dependencyId);
    const association = associations.find(a => a.linked_service_id === serviceId);

    if (!association) {
      res.status(404).json({ error: 'Association not found' });
      return;
    }

    // Delete the association
    stores.associations.delete(association.id);

    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'deleting association');
  }
}
