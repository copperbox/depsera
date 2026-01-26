import { randomUUID } from 'crypto';
import db from '../../db';

interface LastErrorEntry {
  error: string | null;
  error_message: string | null;
}

/**
 * Records error history for dependencies with deduplication.
 * - When unhealthy: only records if this is the first error after healthy, or if error changed
 * - When healthy: records a recovery entry if the last state was an error
 */
export class ErrorHistoryRecorder {
  /**
   * Record an error history entry with deduplication logic.
   * @param dependencyId - The ID of the dependency
   * @param isHealthy - Whether the dependency is currently healthy
   * @param errorJson - JSON string of the error object (null if healthy)
   * @param errorMessage - Human-readable error message (null if healthy)
   * @param timestamp - ISO timestamp for the record
   */
  record(
    dependencyId: string,
    isHealthy: boolean,
    errorJson: string | null,
    errorMessage: string | null,
    timestamp: string
  ): void {
    const lastEntry = this.getLastEntry(dependencyId);

    if (isHealthy) {
      this.handleRecovery(dependencyId, lastEntry, timestamp);
    } else if (errorJson !== null) {
      this.handleError(dependencyId, lastEntry, errorJson, errorMessage, timestamp);
    }
  }

  /**
   * Get the most recent error history entry for a dependency.
   */
  private getLastEntry(dependencyId: string): LastErrorEntry | undefined {
    return db.prepare(`
      SELECT error, error_message
      FROM dependency_error_history
      WHERE dependency_id = ?
      ORDER BY recorded_at DESC
      LIMIT 1
    `).get(dependencyId) as LastErrorEntry | undefined;
  }

  /**
   * Handle a recovery (healthy after error).
   * Records a null error entry to mark the recovery.
   */
  private handleRecovery(
    dependencyId: string,
    lastEntry: LastErrorEntry | undefined,
    timestamp: string
  ): void {
    // If healthy and last entry was an error, record recovery
    if (lastEntry && lastEntry.error !== null) {
      db.prepare(`
        INSERT INTO dependency_error_history (id, dependency_id, error, error_message, recorded_at)
        VALUES (?, ?, NULL, NULL, ?)
      `).run(randomUUID(), dependencyId, timestamp);
    }
  }

  /**
   * Handle an error entry.
   * Only records if this is a new error or the error has changed.
   */
  private handleError(
    dependencyId: string,
    lastEntry: LastErrorEntry | undefined,
    errorJson: string,
    errorMessage: string | null,
    timestamp: string
  ): void {
    // Determine if we should record this error
    const shouldRecord = !lastEntry || // No previous entry
      lastEntry.error === null || // Last entry was a recovery
      lastEntry.error !== errorJson; // Error object is different

    if (shouldRecord) {
      db.prepare(`
        INSERT INTO dependency_error_history (id, dependency_id, error, error_message, recorded_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(randomUUID(), dependencyId, errorJson, errorMessage, timestamp);
    }
  }
}

/**
 * Singleton instance for convenience
 */
let recorderInstance: ErrorHistoryRecorder | null = null;

export function getErrorHistoryRecorder(): ErrorHistoryRecorder {
  if (!recorderInstance) {
    recorderInstance = new ErrorHistoryRecorder();
  }
  return recorderInstance;
}
