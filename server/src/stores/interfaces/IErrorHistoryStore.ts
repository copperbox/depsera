import { DependencyErrorHistory } from '../../db/types';
import { ErrorHistoryEntry } from '../types';

/**
 * Store interface for DependencyErrorHistory entity operations
 */
export interface IErrorHistoryStore {
  /**
   * Record a new error (or recovery) event
   */
  record(
    dependencyId: string,
    error: string | null,
    errorMessage: string | null,
    timestamp: string
  ): DependencyErrorHistory;

  /**
   * Get error history for the last 24 hours
   */
  getErrors24h(dependencyId: string): ErrorHistoryEntry[];

  /**
   * Get the most recent error history entry
   */
  getLastEntry(dependencyId: string): ErrorHistoryEntry | undefined;

  /**
   * Check if an error already exists (for deduplication)
   * Returns true if the last entry matches the given error/message
   */
  isDuplicate(dependencyId: string, error: string | null, errorMessage: string | null): boolean;

  /**
   * Get error count for the last 24 hours
   */
  getErrorCount24h(dependencyId: string): number;

  /**
   * Delete old history entries (for cleanup)
   */
  deleteOlderThan(timestamp: string): number;

  /**
   * Delete all history for a dependency
   */
  deleteByDependencyId(dependencyId: string): number;
}
