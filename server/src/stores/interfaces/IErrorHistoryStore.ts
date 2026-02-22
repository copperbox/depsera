import { DependencyErrorHistory } from '../../db/types';
import { ErrorHistoryEntry } from '../types';

/**
 * Health state transition for timeline visualization
 */
export interface HealthTransition {
  timestamp: string;
  state: 'healthy' | 'unhealthy';
}

/**
 * Valid time range values for timeline queries
 */
export type TimelineRange = '24h' | '7d' | '30d';

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
   * Get health state transitions within a time range for timeline visualization.
   * Returns chronological list of state changes derived from error/recovery events.
   */
  getHealthTransitions(dependencyId: string, range: TimelineRange): HealthTransition[];

  /**
   * Delete old history entries (for cleanup)
   */
  deleteOlderThan(timestamp: string): number;

  /**
   * Delete all history for a dependency
   */
  deleteByDependencyId(dependencyId: string): number;
}
