import { Request, Response } from 'express';
import { AssociationMatcher } from '../../services/matching';

export function getSuggestions(req: Request, res: Response): void {
  try {
    const matcher = AssociationMatcher.getInstance();
    const suggestions = matcher.getPendingSuggestions();

    res.json(suggestions);
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({
      error: 'Failed to fetch suggestions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
