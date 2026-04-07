import { Router } from 'express';
import { getAssociations } from './getAssociations';
import { createAssociation } from './createAssociation';
import { deleteAssociation } from './deleteAssociation';
import { confirmAssociation } from './confirmAssociation';
import { dismissAssociation } from './dismissAssociation';

const router = Router();

// Dependency association endpoints
// GET /api/dependencies/:dependencyId/associations - Get all associations for a dependency
router.get('/dependencies/:dependencyId/associations', getAssociations);

// POST /api/dependencies/:dependencyId/associations - Create a new association
router.post('/dependencies/:dependencyId/associations', createAssociation);

// DELETE /api/dependencies/:dependencyId/associations/:serviceId - Remove an association
router.delete('/dependencies/:dependencyId/associations/:serviceId', deleteAssociation);

// PUT /api/dependencies/:depId/associations/:assocId/confirm - Confirm an auto-suggested association
router.put('/dependencies/:depId/associations/:assocId/confirm', confirmAssociation);

// PUT /api/dependencies/:depId/associations/:assocId/dismiss - Dismiss an auto-suggested association
router.put('/dependencies/:depId/associations/:assocId/dismiss', dismissAssociation);

export default router;
