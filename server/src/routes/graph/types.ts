import { AssociationType, HealthState, DependencyType } from '../../db/types';

export type NodeType = 'service' | 'dependency';

export interface ServiceNodeData {
  name: string;
  teamId: string;
  teamName: string;
  healthEndpoint: string;
  isActive: boolean;
  dependencyCount: number;
  healthyCount: number;
  unhealthyCount: number;
}

export interface DependencyNodeData {
  name: string;
  serviceId: string;
  serviceName: string;
  description: string | null;
  impact: string | null;
  type: DependencyType;
  healthy: boolean | null;
  healthState: HealthState | null;
  healthCode: number | null;
  latencyMs: number | null;
  lastChecked: string | null;
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
