import { Request, Response } from 'express';
import db from '../../db';
import { DependencyAssociation, Service } from '../../db/types';
import { AssociationMatcher } from '../../services/matching';

export function acceptSuggestion(req: Request, res: Response): void {
  try {
    const { suggestionId } = req.params;

    // Verify suggestion exists and is auto-suggested
    const suggestion = db.prepare(`
      SELECT * FROM dependency_associations
      WHERE id = ? AND is_auto_suggested = 1
    `).get(suggestionId) as DependencyAssociation | undefined;

    if (!suggestion) {
      res.status(404).json({ error: 'Suggestion not found or already accepted' });
      return;
    }

    const matcher = AssociationMatcher.getInstance();
    const success = matcher.acceptSuggestion(suggestionId);

    if (!success) {
      res.status(500).json({ error: 'Failed to accept suggestion' });
      return;
    }

    // Get updated association with linked service
    const updated = db.prepare(`
      SELECT * FROM dependency_associations WHERE id = ?
    `).get(suggestionId) as DependencyAssociation;

    const linkedService = db.prepare(`
      SELECT * FROM services WHERE id = ?
    `).get(updated.linked_service_id) as Service;

    res.json({
      ...updated,
      linked_service: linkedService,
    });
  } catch (error) {
    console.error('Error accepting suggestion:', error);
    res.status(500).json({
      error: 'Failed to accept suggestion',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
