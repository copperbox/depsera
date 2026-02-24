import { DependencyType, DependencyCanonicalOverride } from '../../db/types';
import {
  ServiceWithTeam,
  DependencyWithTarget,
  ServiceNodeData,
  GraphNode,
  GraphEdge,
  GraphEdgeData,
  GraphResponse,
} from './types';
import { deduplicateById } from '../../utils/deduplication';
import { ExternalNodeBuilder } from './ExternalNodeBuilder';
import { resolveContact } from '../../utils/overrideResolver';

/**
 * Builds a dependency graph with service nodes and dependency edges.
 */
export class DependencyGraphBuilder {
  private nodes: GraphNode[] = [];
  private edges: GraphEdge[] = [];
  private nodeIds = new Set<string>();
  private edgeIds = new Set<string>();
  private externalNodeMap: Map<string, string> | null = null;
  private canonicalOverrideMap: Map<string, DependencyCanonicalOverride> | null = null;

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
        /* istanbul ignore next -- Poll status conversion; null case rarely occurs */
        lastPollSuccess: service.last_poll_success === null ? null : service.last_poll_success === 1,
        lastPollError: service.last_poll_error ?? null,
        serviceType,
        ...(service.is_external === 1 && { isExternal: true }),
      },
    });

    this.nodeIds.add(service.id);
  }

  /**
   * Add an external (virtual) node to the graph.
   */
  addExternalNode(id: string, data: ServiceNodeData): void {
    if (this.nodeIds.has(id)) return;

    this.nodes.push({ id, type: 'service', data });
    this.nodeIds.add(id);
  }

  /**
   * Set the external node map for resolving unassociated dependencies to external nodes.
   * Map keys are normalized dependency names, values are external node IDs.
   */
  setExternalNodeMap(map: Map<string, string>): void {
    this.externalNodeMap = map;
  }

  /**
   * Set the canonical override map for resolving effective contact info.
   * Map keys are canonical names, values are the override records.
   */
  setCanonicalOverrideMap(map: Map<string, DependencyCanonicalOverride>): void {
    this.canonicalOverrideMap = map;
  }

  /**
   * Add an edge for a dependency relationship.
   * Edge direction represents data flow: from dependency (provider) to dependent (consumer).
   * @param dep - The dependency with target service info
   */
  addEdge(dep: DependencyWithTarget): void {
    let sourceId = dep.target_service_id;

    // If no target_service_id, try to resolve via external node map
    /* istanbul ignore if -- External node map resolution; tested via GraphService */
    if (!sourceId && this.externalNodeMap) {
      const displayName = dep.canonical_name ?? dep.name;
      const normalized = ExternalNodeBuilder.normalizeDepName(displayName);
      sourceId = this.externalNodeMap.get(normalized) ?? null;
    }

    if (!sourceId) return;
    if (!this.nodeIds.has(sourceId)) return;

    const edgeId = `${sourceId}-${dep.service_id}-${dep.type}`;

    // Avoid duplicate edges for same source->target->type
    if (this.edgeIds.has(edgeId)) return;

    this.edgeIds.add(edgeId);
    this.edges.push({
      id: edgeId,
      source: sourceId,
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
    this.externalNodeMap = null;
    this.canonicalOverrideMap = null;
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
      } catch /* istanbul ignore next -- Invalid JSON rarely occurs; data is serialized by server */ {
        // Ignore parse errors
      }
    }

    /* istanbul ignore if -- Error field parsing; usually null or tested via integration */
    if (dep.error) {
      try {
        error = JSON.parse(dep.error);
      } catch {
        // Ignore parse errors
      }
    }

    // Resolve effective contact from 3-tier hierarchy
    const canonicalOverride = dep.canonical_name && this.canonicalOverrideMap
      ? this.canonicalOverrideMap.get(dep.canonical_name)
      : undefined;

    const effectiveContact = resolveContact(
      dep.contact,
      canonicalOverride?.contact_override ?? null,
      dep.contact_override,
    );

    return {
      relationship: 'depends_on',
      dependencyType: dep.type,
      dependencyName: dep.canonical_name ?? dep.name,
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
      impact: dep.impact,
      effectiveContact,
    };
  }
}
