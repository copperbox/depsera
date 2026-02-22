import { Request, Response } from 'express';
import { AssociationMatcher } from '../../services/matching';
import { sendErrorResponse } from '../../utils/errors';

export function getSuggestions(req: Request, res: Response): void {
  try {
    const matcher = AssociationMatcher.getInstance();
    const suggestions = matcher.getPendingSuggestions();

    res.json(suggestions);
  } catch (error) /* istanbul ignore next -- Catch block for unexpected errors */ {
    sendErrorResponse(res, error, 'fetching suggestions');
  }
}
