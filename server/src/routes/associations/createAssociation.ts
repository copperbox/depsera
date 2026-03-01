import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { validateAssociationCreate } from '../../utils/validation';
import { formatAssociation } from '../formatters';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  formatError,
  getErrorStatusCode,
} from '../../utils/errors';
import { AuthorizationService } from '../../auth/authorizationService';

export function createAssociation(req: Request, res: Response): void {
  try {
    const { dependencyId } = req.params;
    const stores = getStores();

    // Validate input using centralized validation
    const validated = validateAssociationCreate(req.body);

    // Verify dependency exists
    const dependency = stores.dependencies.findById(dependencyId);
    if (!dependency) {
      throw new NotFoundError('Dependency');
    }

    // Verify user has team access to the dependency's owning service
    const authResult = AuthorizationService.checkDependencyTeamAccess(req.user!, dependencyId);
    if (!authResult.authorized) {
      res.status(authResult.statusCode!).json({ error: authResult.error });
      return;
    }

    // Verify linked service exists
    const linkedService = stores.services.findById(validated.linked_service_id);
    if (!linkedService) {
      throw new ValidationError('Linked service not found', 'linked_service_id');
    }

    // Prevent linking to the same service that owns the dependency
    if (validated.linked_service_id === dependency.service_id) {
      throw new ValidationError('Cannot link dependency to its own service', 'linked_service_id');
    }

    // Check if association already exists
    const existingAssociations = stores.associations.findByDependencyId(dependencyId);
    const existing = existingAssociations.find(
      (a) => a.linked_service_id === validated.linked_service_id
    );

    if (existing) {
      throw new ConflictError('Association already exists');
    }

    // Create new association
    const association = stores.associations.create({
      dependency_id: dependencyId,
      linked_service_id: validated.linked_service_id,
      association_type: validated.association_type,
    });

    res.status(201).json(formatAssociation(association, linkedService));
  } catch (error) {
    console.error('Error creating association:', error);
    res.status(getErrorStatusCode(error)).json(formatError(error));
  }
}
