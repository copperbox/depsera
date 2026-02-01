export type NodeType = 'service';
export type AssociationType = 'api_call' | 'database' | 'message_queue' | 'cache' | 'other';
export type DependencyType =
  | 'database'
  | 'rest'
  | 'soap'
  | 'grpc'
  | 'graphql'
  | 'message_queue'
  | 'cache'
  | 'file_system'
  | 'smtp'
  | 'other';

export type LayoutDirection = 'TB' | 'LR';

export interface ServiceNodeData {
  name: string;
  teamId: string;
  teamName: string;
  healthEndpoint: string;
  isActive: boolean;
  dependencyCount: number;
  healthyCount: number;
  unhealthyCount: number;
  lastPollSuccess: boolean | null;
  lastPollError: string | null;
  // Reported health: what other services report about THIS service
  reportedHealthyCount: number;
  reportedUnhealthyCount: number;
  serviceType?: DependencyType;
  isExternal?: boolean;
  layoutDirection?: LayoutDirection;
  [key: string]: unknown;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  data: ServiceNodeData;
}

export interface GraphEdgeData {
  relationship: 'depends_on';
  dependencyType?: DependencyType;
  dependencyName?: string;
  dependencyId?: string;
  healthy?: boolean | null;
  latencyMs?: number | null;
  avgLatencyMs24h?: number | null;
  isHighLatency?: boolean;
  associationType?: AssociationType | null;
  isAutoSuggested?: boolean;
  confidenceScore?: number | null;
  isSelected?: boolean;
  isHighlighted?: boolean;
  checkDetails?: Record<string, unknown>;
  error?: unknown;
  errorMessage?: string | null;
  impact?: string | null;
  [key: string]: unknown;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  data: GraphEdgeData;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Helper type for health status display
export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export function getServiceHealthStatus(data: ServiceNodeData): HealthStatus {
  // Health is based on what other services report about THIS service (incoming edges)
  const totalReports = data.reportedHealthyCount + data.reportedUnhealthyCount;

  if (totalReports > 0) {
    if (data.reportedUnhealthyCount > 0) return 'critical';
    return 'healthy';
  }

  // No dependents — derive from own dependencies using 80%/50% thresholds
  const countedDeps = data.healthyCount + data.unhealthyCount;
  if (countedDeps === 0) return 'unknown';

  const healthyPercentage = (data.healthyCount / countedDeps) * 100;
  if (healthyPercentage >= 80) return 'healthy';
  if (healthyPercentage >= 50) return 'warning';
  return 'critical';
}

export function getEdgeHealthStatus(data: GraphEdgeData): HealthStatus {
  if (data.healthy === null || data.healthy === undefined) return 'unknown';
  if (data.healthy === false) return 'critical';
  return 'healthy';
}

// Latency stats response from API
export interface LatencyDataPoint {
  latency_ms: number;
  recorded_at: string;
}

export interface LatencyStatsResponse {
  dependencyId: string;
  currentLatencyMs: number | null;
  avgLatencyMs24h: number | null;
  minLatencyMs24h: number | null;
  maxLatencyMs24h: number | null;
  dataPointCount: number;
  dataPoints: LatencyDataPoint[];
}

// Error history response from API
export interface ErrorHistoryEntry {
  error: unknown;
  errorMessage: string | null;
  recordedAt: string;
  isRecovery: boolean;
}

export interface ErrorHistoryResponse {
  dependencyId: string;
  errorCount: number;
  errors: ErrorHistoryEntry[];
}
