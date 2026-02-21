import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { AssociationMatcher } from '../../services/matching';
import { AuthorizationService } from '../../auth/authorizationService';

export function dismissSuggestion(req: Request, res: Response): void {
  try {
    const { suggestionId } = req.params;
    const stores = getStores();

    // Verify suggestion exists and is auto-suggested
    const suggestion = stores.associations.findById(suggestionId);

    if (!suggestion || !suggestion.is_auto_suggested) {
      res.status(404).json({ error: 'Suggestion not found or already processed' });
      return;
    }

    // Verify user has team access to the dependency's owning service
    const authResult = AuthorizationService.checkDependencyTeamAccess(req.user!, suggestion.dependency_id);
    if (!authResult.authorized) {
      res.status(authResult.statusCode!).json({ error: authResult.error });
      return;
    }

    const matcher = AssociationMatcher.getInstance();
    const success = matcher.dismissSuggestion(suggestionId);

    if (!success) {
      res.status(500).json({ error: 'Failed to dismiss suggestion' });
      return;
    }

    res.status(204).send();
  } catch (error) /* istanbul ignore next -- Catch block for unexpected errors */ {
    console.error('Error dismissing suggestion:', error);
    res.status(500).json({
      error: 'Failed to dismiss suggestion',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
