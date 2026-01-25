import { Request, Response } from 'express';
import db from '../../db';
import { DependencyErrorHistory } from '../../db/types';

interface ErrorHistoryRow {
  error: string | null;
  error_message: string | null;
  recorded_at: string;
}

interface CountRow {
  count: number;
}

export function getErrorHistory(req: Request, res: Response): void {
  try {
    const { dependencyId } = req.params;

    if (!dependencyId) {
      res.status(400).json({ error: 'Dependency ID is required' });
      return;
    }

    // Verify dependency exists
    const dependency = db.prepare(`
      SELECT id FROM dependencies WHERE id = ?
    `).get(dependencyId) as { id: string } | undefined;

    if (!dependency) {
      res.status(404).json({ error: 'Dependency not found' });
      return;
    }

    // Get error count for last 24 hours
    const countResult = db.prepare(`
      SELECT COUNT(*) as count
      FROM dependency_error_history
      WHERE dependency_id = ?
        AND recorded_at >= datetime('now', '-24 hours')
    `).get(dependencyId) as CountRow;

    // Get last 50 errors within 24 hours
    const errors = db.prepare(`
      SELECT error, error_message, recorded_at
      FROM dependency_error_history
      WHERE dependency_id = ?
        AND recorded_at >= datetime('now', '-24 hours')
      ORDER BY recorded_at DESC
      LIMIT 50
    `).all(dependencyId) as ErrorHistoryRow[];

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
      errorCount: countResult.count,
      errors: formattedErrors,
    });
  } catch (error) {
    console.error('Error fetching error history:', error);
    res.status(500).json({
      error: 'Failed to fetch error history',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
