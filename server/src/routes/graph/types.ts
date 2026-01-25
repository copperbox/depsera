import { AssociationType, DependencyType } from '../../db/types';

export type NodeType = 'service';

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
