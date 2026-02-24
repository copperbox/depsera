import { DependencyLatencyHistory } from '../../db/types';
import { LatencyStats } from '../types';

/**
 * Latency data point for history queries
 */
export interface LatencyDataPoint {
  latency_ms: number;
  recorded_at: string;
}

/**
 * Time-bucketed latency data for chart visualization
 */
export interface LatencyBucket {
  timestamp: string;
  min: number;
  avg: number;
  max: number;
  count: number;
}

/**
 * Valid time range values for bucketed queries
 */
export type LatencyRange = '1h' | '6h' | '24h' | '7d' | '30d';

/**
 * Store interface for DependencyLatencyHistory entity operations
 */
export interface ILatencyHistoryStore {
  /**
   * Record a new latency measurement
   */
  record(dependencyId: string, latencyMs: number, timestamp: string): DependencyLatencyHistory;

  /**
   * Get latency statistics for the last 24 hours
   */
  getStats24h(dependencyId: string): LatencyStats;

  /**
   * Get average latency for the last 24 hours
   */
  getAvgLatency24h(dependencyId: string): number | null;

  /**
   * Get latency history for a dependency within a time range
   */
  getHistory(
    dependencyId: string,
    options?: {
      startTime?: string;
      endTime?: string;
      limit?: number;
    }
  ): LatencyDataPoint[];

  /**
   * Get time-bucketed latency data for chart visualization
   */
  getLatencyBuckets(dependencyId: string, range: LatencyRange): LatencyBucket[];

  /**
   * Get aggregated time-bucketed latency data across multiple dependencies
   */
  getAggregateLatencyBuckets(dependencyIds: string[], range: LatencyRange): LatencyBucket[];

  /**
   * Delete old history entries (for cleanup)
   */
  deleteOlderThan(timestamp: string): number;

  /**
   * Delete all history for a dependency
   */
  deleteByDependencyId(dependencyId: string): number;
}
