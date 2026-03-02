import { Router } from 'express';
import { getAssociations } from './getAssociations';
import { createAssociation } from './createAssociation';
import { deleteAssociation } from './deleteAssociation';

const router = Router();

// Dependency association endpoints
// GET /api/dependencies/:dependencyId/associations - Get all associations for a dependency
router.get('/dependencies/:dependencyId/associations', getAssociations);

// POST /api/dependencies/:dependencyId/associations - Create a new association
router.post('/dependencies/:dependencyId/associations', createAssociation);

// DELETE /api/dependencies/:dependencyId/associations/:serviceId - Remove an association
router.delete('/dependencies/:dependencyId/associations/:serviceId', deleteAssociation);

export default router;
