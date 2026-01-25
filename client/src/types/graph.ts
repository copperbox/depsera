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
  serviceType?: DependencyType;
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
  healthy?: boolean | null;
  latencyMs?: number | null;
  associationType?: AssociationType | null;
  isAutoSuggested?: boolean;
  confidenceScore?: number | null;
  isSelected?: boolean;
  isHighlighted?: boolean;
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
  if (data.dependencyCount === 0) return 'unknown';
  if (data.unhealthyCount > 0) return 'critical';
  if (data.healthyCount === data.dependencyCount) return 'healthy';
  return 'warning';
}

export function getEdgeHealthStatus(data: GraphEdgeData): HealthStatus {
  if (data.healthy === null || data.healthy === undefined) return 'unknown';
  if (data.healthy === false) return 'critical';
  return 'healthy';
}
