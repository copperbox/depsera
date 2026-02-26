import { Service, Dependency, DependencyType, AssociationType } from '../../db/types';

/**
 * Service with team name joined from teams table
 */
export interface ServiceWithTeam extends Service {
  team_name: string;
}

/**
 * Dependency with additional fields from associations and computed values
 */
export interface DependencyWithTarget extends Dependency {
  service_name: string;
  target_service_id: string | null;
  association_type: string | null;
  is_auto_suggested: number | null;
  confidence_score: number | null;
  avg_latency_24h: number | null;
}

/**
 * Node type for the dependency graph
 */
export type NodeType = 'service';

/**
 * Data associated with a service node
 */
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
  skippedCount: number;
  serviceType?: DependencyType;
  isExternal?: boolean;
}

/**
 * A node in the dependency graph
 */
export interface GraphNode {
  id: string;
  type: NodeType;
  data: ServiceNodeData;
}

/**
 * Data associated with an edge (dependency relationship)
 */
export interface GraphEdgeData {
  relationship: 'depends_on';
  dependencyType?: DependencyType;
  dependencyName?: string;
  canonicalName?: string | null;
  dependencyId?: string;
  healthy?: boolean | null;
  latencyMs?: number | null;
  avgLatencyMs24h?: number | null;
  associationType?: AssociationType | null;
  isAutoSuggested?: boolean;
  confidenceScore?: number | null;
  checkDetails?: Record<string, unknown>;
  error?: unknown;
  errorMessage?: string | null;
  impact?: string | null;
  effectiveContact?: string | null;
  skipped?: boolean;
}

/**
 * An edge in the dependency graph
 */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  data: GraphEdgeData;
}

/**
 * Complete graph response containing nodes and edges
 */
export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
