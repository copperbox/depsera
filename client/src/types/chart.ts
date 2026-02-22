/**
 * Time range options for chart data queries
 */
export type LatencyRange = '1h' | '6h' | '24h' | '7d' | '30d';
export type TimelineRange = '24h' | '7d' | '30d';
export type ChartRange = LatencyRange | TimelineRange;

/**
 * Time-bucketed latency data point for chart visualization
 */
export interface LatencyBucket {
  timestamp: string;
  min: number;
  avg: number;
  max: number;
  count: number;
}

/**
 * Response from GET /api/latency/:dependencyId/buckets
 */
export interface LatencyBucketsResponse {
  dependencyId: string;
  range: LatencyRange;
  buckets: LatencyBucket[];
}

/**
 * Health state transition for timeline visualization
 */
export interface HealthTransition {
  timestamp: string;
  state: 'healthy' | 'unhealthy';
}

/**
 * Response from GET /api/dependencies/:id/timeline
 */
export interface HealthTimelineResponse {
  dependencyId: string;
  range: TimelineRange;
  currentState: 'healthy' | 'unhealthy' | 'unknown';
  transitions: HealthTransition[];
}
