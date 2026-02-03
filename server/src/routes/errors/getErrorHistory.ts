import { Request, Response } from 'express';
import { getStores } from '../../stores';

export function getErrorHistory(req: Request, res: Response): void {
  try {
    const { dependencyId } = req.params;
    const stores = getStores();

    /* istanbul ignore if -- Route param always present; validation for type safety */
    if (!dependencyId) {
      res.status(400).json({ error: 'Dependency ID is required' });
      return;
    }

    // Verify dependency exists
    if (!stores.dependencies.exists(dependencyId)) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    // Get error count for last 24 hours
    const errorCount = stores.errorHistory.getErrorCount24h(dependencyId);

    // Get last 50 errors within 24 hours
    const errors = stores.errorHistory.getErrors24h(dependencyId).slice(0, 50);

    // Parse error JSON and format response
    const formattedErrors = errors.map(e => {
      let parsedError: unknown = null;
      if (e.error) {
        try {
          parsedError = JSON.parse(e.error);
        } catch {
          parsedError = e.error;
        }
      }

      // An entry with null error is a recovery event
      const isRecovery = e.error === null && e.error_message === null;

      return {
        error: parsedError,
        errorMessage: e.error_message,
        recordedAt: e.recorded_at,
        isRecovery,
      };
    });

    res.json({
      dependencyId,
      errorCount,
      errors: formattedErrors,
    });
  } catch (error) /* istanbul ignore next -- Catch block for unexpected database/infrastructure errors */ {
    console.error('Error fetching error history:', error);
    res.status(500).json({
      error: 'Failed to fetch error history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
