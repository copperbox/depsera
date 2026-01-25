export type NodeType = 'service' | 'dependency';
export type AssociationType = 'api_call' | 'database' | 'message_queue' | 'cache' | 'other';
export type HealthState = 0 | 1 | 2; // 0=OK, 1=WARNING, 2=CRITICAL

export interface ServiceNodeData {
  name: string;
  teamId: string;
  teamName: string;
  healthEndpoint: string;
  isActive: boolean;
  dependencyCount: number;
  healthyCount: number;
  unhealthyCount: number;
  [key: string]: unknown;
}

export interface DependencyNodeData {
  name: string;
  serviceId: string;
  serviceName: string;
  description: string | null;
  impact: string | null;
  healthy: boolean | null;
  healthState: HealthState | null;
  healthCode: number | null;
  latencyMs: number | null;
  lastChecked: string | null;
  [key: string]: unknown;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  data: ServiceNodeData | DependencyNodeData;
}

export interface GraphEdgeData {
  associationType?: AssociationType;
  isAutoSuggested?: boolean;
  confidenceScore?: number | null;
  relationship: 'reports' | 'depends_on';
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

export function getDependencyHealthStatus(data: DependencyNodeData): HealthStatus {
  if (data.healthy === null) return 'unknown';
  if (data.healthy === false) return 'critical';
  if (data.healthState === 1) return 'warning';
  return 'healthy';
}
