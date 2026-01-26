import { DependencyType } from '../../db/types';
import {
  ServiceWithTeam,
  DependencyWithTarget,
  GraphNode,
  GraphEdge,
  GraphEdgeData,
  GraphResponse,
} from './types';
import { deduplicateById } from '../../utils/deduplication';

/**
 * Builds a dependency graph with service nodes and dependency edges.
 */
export class DependencyGraphBuilder {
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];
  private nodeIds = new Set<string>();
  private edgeIds = new Set<string>();

  /**
   * Add a service node to the graph.
   * @param service - The service with team info
   * @param dependencies - Dependencies owned by this service
   * @param serviceType - Optional inferred service type based on incoming dependencies
   */
  addServiceNode(
    service: ServiceWithTeam,
    dependencies: DependencyWithTarget[],
    serviceType?: DependencyType
  ): void {
    if (this.nodeIds.has(service.id)) return;

    // Dedupe dependencies by ID for counting
    const uniqueDeps = deduplicateById(dependencies);
    const healthyCount = uniqueDeps.filter(d => d.healthy === 1).length;
    const unhealthyCount = uniqueDeps.filter(d => d.healthy === 0).length;

    this.nodes.push({
      id: service.id,
      type: 'service',
      data: {
        name: service.name,
        teamId: service.team_id,
        teamName: service.team_name,
        healthEndpoint: service.health_endpoint,
        isActive: service.is_active === 1,
        dependencyCount: uniqueDeps.length,
        healthyCount,
        unhealthyCount,
        serviceType,
      },
    });

    this.nodeIds.add(service.id);
  }

  /**
   * Add an edge for a dependency relationship.
   * Edge direction represents data flow: from dependency (provider) to dependent (consumer).
   * @param dep - The dependency with target service info
   */
  addEdge(dep: DependencyWithTarget): void {
    if (!dep.target_service_id) return;
    if (!this.nodeIds.has(dep.target_service_id)) return;

    const edgeId = `${dep.target_service_id}-${dep.service_id}-${dep.type}`;

    // Avoid duplicate edges for same source->target->type
    if (this.edgeIds.has(edgeId)) return;

    this.edgeIds.add(edgeId);
    this.edges.push({
      id: edgeId,
      source: dep.target_service_id,
      target: dep.service_id,
      data: this.createEdgeData(dep),
    });
  }

  /**
   * Check if a node exists in the graph.
   */
  hasNode(id: string): boolean {
    return this.nodeIds.has(id);
  }

  /**
   * Build and return the complete graph response.
   */
  build(): GraphResponse {
    return {
      nodes: [...this.nodes],
      edges: [...this.edges],
    };
  }

  /**
   * Reset the builder for a new graph.
   */
  reset(): void {
    this.nodes = [];
    this.edges = [];
    this.nodeIds.clear();
    this.edgeIds.clear();
  }

  /**
   * Create edge data from a dependency.
   */
  private createEdgeData(dep: DependencyWithTarget): GraphEdgeData {
    // Parse JSON fields
    let checkDetails: Record<string, unknown> | undefined;
    let error: unknown | undefined;

    if (dep.check_details) {
      try {
        checkDetails = JSON.parse(dep.check_details);
      } catch {
        // Ignore parse errors
      }
    }

    if (dep.error) {
      try {
        error = JSON.parse(dep.error);
      } catch {
        // Ignore parse errors
      }
    }

    return {
      relationship: 'depends_on',
      dependencyType: dep.type,
      dependencyName: dep.name,
      dependencyId: dep.id,
      healthy: dep.healthy === null ? null : dep.healthy === 1,
      latencyMs: dep.latency_ms,
      avgLatencyMs24h: dep.avg_latency_24h,
      associationType: dep.association_type as GraphEdgeData['associationType'],
      isAutoSuggested: dep.is_auto_suggested === 1,
      confidenceScore: dep.confidence_score,
      checkDetails,
      error,
      errorMessage: dep.error_message,
    };
  }
}
