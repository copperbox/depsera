import { getStores, StoreRegistry } from '../../stores';
import type {
  IServiceStore,
  IDependencyStore,
  ITeamStore,
} from '../../stores/interfaces';
import {
  ServiceWithTeam as StoreServiceWithTeam,
  DependencyWithTarget as StoreDependencyWithTarget,
} from '../../stores/types';
import { ServiceWithTeam, DependencyWithTarget, GraphResponse } from './types';
import { ServiceTypeInferencer } from './ServiceTypeInferencer';
import { DependencyGraphBuilder } from './DependencyGraphBuilder';
import { ExternalNodeBuilder } from './ExternalNodeBuilder';
import { groupByKey } from '../../utils/deduplication';

/**
 * Service for building dependency graphs.
 * Provides methods for fetching full, team-scoped, and service-scoped graphs.
 */
export class GraphService {
  private typeInferencer: ServiceTypeInferencer;
  private serviceStore: IServiceStore;
  private dependencyStore: IDependencyStore;
  private teamStore: ITeamStore;

  constructor(typeInferencer?: ServiceTypeInferencer, stores?: StoreRegistry) {
    const storeRegistry = stores || getStores();
    this.typeInferencer = typeInferencer || new ServiceTypeInferencer();
    this.serviceStore = storeRegistry.services;
    this.dependencyStore = storeRegistry.dependencies;
    this.teamStore = storeRegistry.teams;
  }

  /**
   * Get the full dependency graph for all active services.
   */
  getFullGraph(): GraphResponse {
    const services = this.serviceStore.findActiveWithTeam() as ServiceWithTeam[];
    const dependencies = this.dependencyStore.findAllWithAssociationsAndLatency({
      activeServicesOnly: true,
    }) as DependencyWithTarget[];

    return this.buildGraph(services, dependencies);
  }

  /**
   * Get the dependency graph for a specific team.
   * Includes external services that the team's services depend on.
   */
  getTeamGraph(teamId: string): GraphResponse {
    // Verify team exists
    const team = this.teamStore.findById(teamId);
    if (!team) {
      return { nodes: [], edges: [] };
    }

    const services = this.serviceStore.findAllWithTeam({
      teamId,
      isActive: true,
    }) as ServiceWithTeam[];

    if (services.length === 0) {
      return { nodes: [], edges: [] };
    }

    const serviceIds = services.map(s => s.id);
    const dependencies = this.dependencyStore.findByServiceIdsWithAssociationsAndLatency(
      serviceIds
    ) as DependencyWithTarget[];

    // Build initial graph with team services
    const builder = new DependencyGraphBuilder();
    const depsByService = groupByKey(dependencies, 'service_id');
    const serviceTypes = this.typeInferencer.compute(dependencies);

    for (const service of services) {
      const serviceDeps = depsByService.get(service.id) || [];
      builder.addServiceNode(service, serviceDeps, serviceTypes.get(service.id));
    }

    // Find external services (associated but from other teams) and add them
    const externalServiceIds = this.findExternalServiceIds(dependencies, builder);
    if (externalServiceIds.length > 0) {
      this.addExternalServices(builder, externalServiceIds, serviceTypes);
    }

    // Add external nodes for unassociated dependencies
    this.addExternalNodes(builder, dependencies);

    // Add edges
    for (const dep of dependencies) {
      builder.addEdge(dep);
    }

    return builder.build();
  }

  /**
   * Get the subgraph for a specific service and its upstream dependencies.
   */
  getServiceSubgraph(serviceId: string): GraphResponse {
    const builder = new DependencyGraphBuilder();
    const allDependencies: DependencyWithTarget[] = [];
    const serviceData: { service: ServiceWithTeam; deps: DependencyWithTarget[] }[] = [];
    const visitedServices = new Set<string>();

    // Recursively traverse upstream dependencies
    this.traverseUpstream(serviceId, visitedServices, allDependencies, serviceData);

    // Compute service types based on all collected dependencies
    const serviceTypes = this.typeInferencer.compute(allDependencies);

    // Build nodes
    for (const { service, deps } of serviceData) {
      builder.addServiceNode(service, deps, serviceTypes.get(service.id));
    }

    // Add external nodes for unassociated dependencies
    this.addExternalNodes(builder, allDependencies);

    // Build edges
    for (const { deps } of serviceData) {
      for (const dep of deps) {
        builder.addEdge(dep);
      }
    }

    return builder.build();
  }

  /**
   * Get the subgraph for a dependency by finding its owning service.
   */
  getDependencySubgraph(dependencyId: string): GraphResponse {
    const dependency = this.dependencyStore.findById(dependencyId);

    if (!dependency) {
      return { nodes: [], edges: [] };
    }

    return this.getServiceSubgraph(dependency.service_id);
  }

  /**
   * Build a graph from services and dependencies.
   */
  private buildGraph(
    services: ServiceWithTeam[],
    dependencies: DependencyWithTarget[]
  ): GraphResponse {
    const builder = new DependencyGraphBuilder();
    const depsByService = groupByKey(dependencies, 'service_id');
    const serviceTypes = this.typeInferencer.compute(dependencies);

    // Add service nodes
    for (const service of services) {
      const serviceDeps = depsByService.get(service.id) || [];
      builder.addServiceNode(service, serviceDeps, serviceTypes.get(service.id));
    }

    // Add external nodes for unassociated dependencies
    this.addExternalNodes(builder, dependencies);

    // Add edges
    for (const dep of dependencies) {
      builder.addEdge(dep);
    }

    return builder.build();
  }

  /**
   * Add external (virtual) nodes for unassociated dependencies.
   */
  private addExternalNodes(
    builder: DependencyGraphBuilder,
    dependencies: DependencyWithTarget[]
  ): void {
    const groups = ExternalNodeBuilder.groupUnassociatedDeps(dependencies);
    if (groups.size === 0) return;

    for (const [, group] of groups) {
      const nodeData = ExternalNodeBuilder.buildNodeData(group.name, group.deps);
      builder.addExternalNode(group.id, nodeData);
    }

    builder.setExternalNodeMap(ExternalNodeBuilder.buildNameToIdMap(groups));
  }

  /**
   * Recursively traverse upstream dependencies.
   */
  private traverseUpstream(
    serviceId: string,
    visitedServices: Set<string>,
    allDependencies: DependencyWithTarget[],
    serviceData: { service: ServiceWithTeam; deps: DependencyWithTarget[] }[]
  ): void {
    if (visitedServices.has(serviceId)) return;
    visitedServices.add(serviceId);

    const service = this.serviceStore.findByIdWithTeam(serviceId) as ServiceWithTeam | undefined;
    if (!service) return;

    const dependencies = this.dependencyStore.findByServiceIdsWithAssociationsAndLatency([
      serviceId,
    ]) as DependencyWithTarget[];
    allDependencies.push(...dependencies);
    serviceData.push({ service, deps: dependencies });

    // Traverse to upstream services
    for (const dep of dependencies) {
      if (dep.target_service_id) {
        this.traverseUpstream(dep.target_service_id, visitedServices, allDependencies, serviceData);
      }
    }
  }

  /**
   * Find external service IDs that are not in the current graph.
   */
  private findExternalServiceIds(
    dependencies: DependencyWithTarget[],
    builder: DependencyGraphBuilder
  ): string[] {
    const externalIds: string[] = [];
    const seen = new Set<string>();

    for (const dep of dependencies) {
      if (dep.target_service_id && !builder.hasNode(dep.target_service_id) && !seen.has(dep.target_service_id)) {
        externalIds.push(dep.target_service_id);
        seen.add(dep.target_service_id);
      }
    }

    return externalIds;
  }

  /**
   * Add external services to the graph.
   */
  private addExternalServices(
    builder: DependencyGraphBuilder,
    serviceIds: string[],
    serviceTypes: Map<string, import('../../db/types').DependencyType>
  ): void {
    /* istanbul ignore if -- Defensive guard; caller checks length before calling */
    if (serviceIds.length === 0) return;

    for (const serviceId of serviceIds) {
      const service = this.serviceStore.findByIdWithTeam(serviceId) as ServiceWithTeam | undefined;
      if (!service) continue;

      const serviceDeps = this.dependencyStore.findByServiceId(serviceId);

      // Convert to DependencyWithTarget format for compatibility
      const depsWithTarget: DependencyWithTarget[] = serviceDeps.map(d => ({
        ...d,
        service_name: service.name,
        target_service_id: null,
        association_type: null,
        is_auto_suggested: null,
        confidence_score: null,
        avg_latency_24h: null,
      }));

      builder.addServiceNode(service, depsWithTarget, serviceTypes.get(service.id));
    }
  }
}

/**
 * Singleton instance for convenience
 */
let graphServiceInstance: GraphService | null = null;

export function getGraphService(): GraphService {
  if (!graphServiceInstance) {
    graphServiceInstance = new GraphService();
  }
  return graphServiceInstance;
}
