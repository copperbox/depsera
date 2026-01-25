import { Request, Response } from 'express';
import db from '../../db';
import { Dependency, Service } from '../../db/types';
import { AssociationMatcher } from '../../services/matching';

export function generateSuggestionsForDependency(req: Request, res: Response): void {
  try {
    const { dependencyId } = req.params;

    // Verify dependency exists
    const dependency = db.prepare(`
      SELECT * FROM dependencies WHERE id = ?
    `).get(dependencyId) as Dependency | undefined;

    if (!dependency) {
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
  } catch (error) {
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

    // Verify service exists
    const service = db.prepare(`
      SELECT * FROM services WHERE id = ?
    `).get(serviceId) as Service | undefined;

    if (!service) {
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
  } catch (error) {
    console.error('Error generating suggestions:', error);
    res.status(500).json({
      error: 'Failed to generate suggestions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
