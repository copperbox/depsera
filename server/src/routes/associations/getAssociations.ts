import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { DependencyAssociation, Service } from '../../db/types';
import { sendErrorResponse } from '../../utils/errors';

interface AssociationWithService extends DependencyAssociation {
  linked_service: Service;
}

export function getAssociations(req: Request, res: Response): void {
  try {
    const { dependencyId } = req.params;
    const stores = getStores();

    // Verify dependency exists
    if (!stores.dependencies.exists(dependencyId)) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    // Get associations with linked service details
    const associations = stores.associations.findByDependencyIdWithService(dependencyId);

    // Transform to include nested linked_service object
    const result: AssociationWithService[] = associations
      .map(row => {
        const linkedService = stores.services.findById(row.linked_service_id);
        return {
          id: row.id,
          dependency_id: row.dependency_id,
          linked_service_id: row.linked_service_id,
          association_type: row.association_type,
          manifest_managed: row.manifest_managed,
          created_at: row.created_at,
          linked_service: linkedService!,
        };
      });

    res.json(result);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    sendErrorResponse(res, error, 'fetching associations');
  }
}
