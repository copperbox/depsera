import { Router } from 'express';
import { getAssociations } from './getAssociations';
import { createAssociation } from './createAssociation';
import { deleteAssociation } from './deleteAssociation';
import { getSuggestions } from './getSuggestions';
import { acceptSuggestion } from './acceptSuggestion';
import { dismissSuggestion } from './dismissSuggestion';
import { generateSuggestionsForDependency, generateSuggestionsForService } from './generateSuggestions';

const router = Router();

// Dependency association endpoints
// GET /api/dependencies/:dependencyId/associations - Get all associations for a dependency
router.get('/dependencies/:dependencyId/associations', getAssociations);

// POST /api/dependencies/:dependencyId/associations - Create a new association
router.post('/dependencies/:dependencyId/associations', createAssociation);

// DELETE /api/dependencies/:dependencyId/associations/:serviceId - Remove an association
router.delete('/dependencies/:dependencyId/associations/:serviceId', deleteAssociation);

// POST /api/dependencies/:dependencyId/suggestions/generate - Generate suggestions for a dependency
router.post('/dependencies/:dependencyId/suggestions/generate', generateSuggestionsForDependency);

// Service-level suggestion generation
// POST /api/services/:serviceId/suggestions/generate - Generate suggestions for all dependencies of a service
router.post('/services/:serviceId/suggestions/generate', generateSuggestionsForService);

// Global suggestion endpoints
// GET /api/associations/suggestions - Get all pending suggestions
router.get('/associations/suggestions', getSuggestions);

// POST /api/associations/suggestions/:suggestionId/accept - Accept a suggestion
router.post('/associations/suggestions/:suggestionId/accept', acceptSuggestion);

// POST /api/associations/suggestions/:suggestionId/dismiss - Dismiss a suggestion
router.post('/associations/suggestions/:suggestionId/dismiss', dismissSuggestion);

export default router;
