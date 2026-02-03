import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AssociationMatcher } from '../../services/matching';

export function generateSuggestionsForDependency(req: Request, res: Response): void {
  try {
    const { dependencyId } = req.params;
    const stores = getStores();

    // Verify dependency exists
    if (!stores.dependencies.exists(dependencyId)) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    const matcher = AssociationMatcher.getInstance();
    const suggestions = matcher.generateSuggestions(dependencyId);

    res.json({
      dependency_id: dependencyId,
      suggestions_created: suggestions.length,
      suggestions,
    });
  } catch (error) /* istanbul ignore next -- Catch block for unexpected errors */ {
    console.error('Error generating suggestions:', error);
    res.status(500).json({
      error: 'Failed to generate suggestions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export function generateSuggestionsForService(req: Request, res: Response): void {
  try {
    const { serviceId } = req.params;
    const stores = getStores();

    // Verify service exists
    if (!stores.services.exists(serviceId)) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }

    const matcher = AssociationMatcher.getInstance();
    const suggestions = matcher.generateSuggestionsForService(serviceId);

    res.json({
      service_id: serviceId,
      suggestions_created: suggestions.length,
      suggestions,
    });
  } catch (error) /* istanbul ignore next -- Catch block for unexpected errors */ {
    console.error('Error generating suggestions:', error);
    res.status(500).json({
      error: 'Failed to generate suggestions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
