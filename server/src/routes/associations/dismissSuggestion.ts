import { Request, Response } from 'express';
import db from '../../db';
import { DependencyAssociation } from '../../db/types';
import { AssociationMatcher } from '../../services/matching';

export function dismissSuggestion(req: Request, res: Response): void {
  try {
    const { suggestionId } = req.params;

    // Verify suggestion exists and is auto-suggested
    const suggestion = db.prepare(`
      SELECT * FROM dependency_associations
      WHERE id = ? AND is_auto_suggested = 1
    `).get(suggestionId) as DependencyAssociation | undefined;

    if (!suggestion) {
      res.status(404).json({ error: 'Suggestion not found or already processed' });
      return;
    }

    const matcher = AssociationMatcher.getInstance();
    const success = matcher.dismissSuggestion(suggestionId);

    if (!success) {
      res.status(500).json({ error: 'Failed to dismiss suggestion' });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error dismissing suggestion:', error);
    res.status(500).json({
      error: 'Failed to dismiss suggestion',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
