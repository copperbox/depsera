import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AuthorizationService } from '../../auth/authorizationService';
import { sendErrorResponse } from '../../utils/errors';

export function enrichDiscoveredDep(req: Request, res: Response): void {
  try {
    const { id } = req.params;
    const stores = getStores();

    // Verify user has team access to the dependency's owning service
    const authResult = AuthorizationService.checkDependencyTeamAccess(req.user!, id);
    if (!authResult.authorized) {
      res.status(authResult.statusCode!).json({ error: authResult.error });
      return;
    }

    const enrichment: { displayName?: string | null; description?: string | null; impact?: string | null } = {};

    if ('displayName' in req.body) enrichment.displayName = req.body.displayName;
    if ('description' in req.body) enrichment.description = req.body.description;
    if ('impact' in req.body) enrichment.impact = req.body.impact;

    // Validate at least one field is provided
    if (Object.keys(enrichment).length === 0) {
      res.status(400).json({ error: 'At least one enrichment field is required (displayName, description, impact)' });
      return;
    }

    const updated = stores.dependencies.updateUserEnrichment(id, enrichment);

    if (!updated) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    res.status(200).json(updated);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'enriching dependency');
  }
}
