import { getStores, StoreRegistry } from '../../stores';
import type { IErrorHistoryStore } from '../../stores/interfaces';

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
  private errorHistoryStore: IErrorHistoryStore;

  constructor(stores?: StoreRegistry) {
    this.errorHistoryStore = (stores || getStores()).errorHistory;
  }

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
    } else {
      // When unhealthy but no error details provided, use a synthetic marker
      // to distinguish from recovery entries (which use null for both fields)
      const effectiveError = errorJson ?? '{"unhealthy":true}';
      const effectiveMessage = errorMessage ?? 'Unhealthy';
      this.handleError(dependencyId, lastEntry, effectiveError, effectiveMessage, timestamp);
    }
  }

  /**
   * Get the most recent error history entry for a dependency.
   */
  private getLastEntry(dependencyId: string): LastErrorEntry | undefined {
    const entry = this.errorHistoryStore.getLastEntry(dependencyId);
    if (!entry) return undefined;
    return {
      error: entry.error,
      error_message: entry.error_message,
    };
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
      this.errorHistoryStore.record(dependencyId, null, null, timestamp);
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
      this.errorHistoryStore.record(dependencyId, errorJson, errorMessage, timestamp);
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
