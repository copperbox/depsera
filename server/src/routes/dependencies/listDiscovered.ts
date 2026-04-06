import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AuthorizationService } from '../../auth/authorizationService';
import { sendErrorResponse } from '../../utils/errors';

export function listDiscovered(req: Request, res: Response): void {
  try {
    const { serviceId } = req.params;
    const stores = getStores();

    // Verify service exists
    const service = stores.services.findById(serviceId);
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    // Verify user has team access
    const authResult = AuthorizationService.checkServiceTeamAccess(req.user!, serviceId);
    if (!authResult.authorized) {
      res.status(authResult.statusCode!).json({ error: authResult.error });
      return;
    }

    const dependencies = stores.dependencies.findByDiscoverySource(serviceId, 'otlp_trace');

    // Attach auto-suggested associations for each dependency
    const result = dependencies.map((dep) => {
      const autoSuggested = stores.associations.findAutoSuggested(dep.id);
      return {
        ...dep,
        auto_suggested_associations: autoSuggested,
      };
    });

    res.status(200).json(result);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'listing discovered dependencies');
  }
}
