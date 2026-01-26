import db from '../../db';
import { Dependency, Team } from '../../db/types';
import { ServiceWithTeam, DependencyWithTarget, GraphResponse } from './types';
import { ServiceTypeInferencer } from './ServiceTypeInferencer';
import { DependencyGraphBuilder } from './DependencyGraphBuilder';
import { groupByKey } from '../../utils/deduplication';

/**
 * Service for building dependency graphs.
 * Provides methods for fetching full, team-scoped, and service-scoped graphs.
 */
export class GraphService {
  private typeInferencer: ServiceTypeInferencer;

  constructor(typeInferencer?: ServiceTypeInferencer) {
    this.typeInferencer = typeInferencer || new ServiceTypeInferencer();
  }

  /**
   * Get the full dependency graph for all active services.
   */
  getFullGraph(): GraphResponse {
    const services = this.fetchAllServices();
    const dependencies = this.fetchAllDependencies();

    return this.buildGraph(services, dependencies);
  }

  /**
   * Get the dependency graph for a specific team.
   * Includes external services that the team's services depend on.
   */
  getTeamGraph(teamId: string): GraphResponse {
    // Verify team exists
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as Team | undefined;
    if (!team) {
      return { nodes: [], edges: [] };
    }

    const services = this.fetchTeamServices(teamId);
    if (services.length === 0) {
      return { nodes: [], edges: [] };
    }

    const serviceIds = services.map(s => s.id);
    const dependencies = this.fetchDependenciesForServices(serviceIds);

    // Build initial graph with team services
    const builder = new DependencyGraphBuilder();
    const depsByService = groupByKey(dependencies, 'service_id');
    const serviceTypes = this.typeInferencer.compute(dependencies);

    for (const service of services) {
      const serviceDeps = depsByService.get(service.id) || [];
      builder.addServiceNode(service, serviceDeps, serviceTypes.get(service.id));
    }

    // Find external services and add them
    const externalServiceIds = this.findExternalServiceIds(dependencies, builder);
    if (externalServiceIds.length > 0) {
      this.addExternalServices(builder, externalServiceIds, serviceTypes);
    }

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
    const dependency = db.prepare(`
      SELECT service_id FROM dependencies WHERE id = ?
    `).get(dependencyId) as { service_id: string } | undefined;

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

    // Add edges
    for (const dep of dependencies) {
      builder.addEdge(dep);
    }

    return builder.build();
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

    const service = this.fetchService(serviceId);
    if (!service) return;

    const dependencies = this.fetchDependenciesForService(serviceId);
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
    if (serviceIds.length === 0) return;

    const placeholders = serviceIds.map(() => '?').join(',');
    const externalServices = db.prepare(`
      SELECT s.*, t.name as team_name
      FROM services s
      JOIN teams t ON s.team_id = t.id
      WHERE s.id IN (${placeholders})
    `).all(...serviceIds) as ServiceWithTeam[];

    for (const service of externalServices) {
      const serviceDeps = db.prepare(`
        SELECT * FROM dependencies WHERE service_id = ?
      `).all(service.id) as Dependency[];

      // Convert to DependencyWithTarget format for compatibility
      const depsWithTarget = serviceDeps.map(d => ({
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

  // Data fetching methods

  private fetchAllServices(): ServiceWithTeam[] {
    return db.prepare(`
      SELECT s.*, t.name as team_name
      FROM services s
      JOIN teams t ON s.team_id = t.id
      WHERE s.is_active = 1
    `).all() as ServiceWithTeam[];
  }

  private fetchTeamServices(teamId: string): ServiceWithTeam[] {
    return db.prepare(`
      SELECT s.*, t.name as team_name
      FROM services s
      JOIN teams t ON s.team_id = t.id
      WHERE s.team_id = ? AND s.is_active = 1
    `).all(teamId) as ServiceWithTeam[];
  }

  private fetchService(serviceId: string): ServiceWithTeam | undefined {
    return db.prepare(`
      SELECT s.*, t.name as team_name
      FROM services s
      JOIN teams t ON s.team_id = t.id
      WHERE s.id = ?
    `).get(serviceId) as ServiceWithTeam | undefined;
  }

  private fetchAllDependencies(): DependencyWithTarget[] {
    return db.prepare(`
      SELECT
        d.*,
        d.check_details,
        d.error,
        d.error_message,
        s.name as service_name,
        da.linked_service_id as target_service_id,
        da.association_type,
        da.is_auto_suggested,
        da.confidence_score,
        (
          SELECT ROUND(AVG(latency_ms))
          FROM dependency_latency_history
          WHERE dependency_id = d.id
            AND recorded_at >= datetime('now', '-24 hours')
        ) as avg_latency_24h
      FROM dependencies d
      JOIN services s ON d.service_id = s.id
      LEFT JOIN dependency_associations da ON d.id = da.dependency_id AND da.is_dismissed = 0
      WHERE s.is_active = 1
    `).all() as DependencyWithTarget[];
  }

  private fetchDependenciesForServices(serviceIds: string[]): DependencyWithTarget[] {
    const placeholders = serviceIds.map(() => '?').join(',');
    return db.prepare(`
      SELECT
        d.*,
        d.check_details,
        d.error,
        d.error_message,
        s.name as service_name,
        da.linked_service_id as target_service_id,
        da.association_type,
        da.is_auto_suggested,
        da.confidence_score,
        (
          SELECT ROUND(AVG(latency_ms))
          FROM dependency_latency_history
          WHERE dependency_id = d.id
            AND recorded_at >= datetime('now', '-24 hours')
        ) as avg_latency_24h
      FROM dependencies d
      JOIN services s ON d.service_id = s.id
      LEFT JOIN dependency_associations da ON d.id = da.dependency_id AND da.is_dismissed = 0
      WHERE d.service_id IN (${placeholders})
    `).all(...serviceIds) as DependencyWithTarget[];
  }

  private fetchDependenciesForService(serviceId: string): DependencyWithTarget[] {
    return db.prepare(`
      SELECT
        d.*,
        d.check_details,
        d.error,
        d.error_message,
        s.name as service_name,
        da.linked_service_id as target_service_id,
        da.association_type,
        da.is_auto_suggested,
        da.confidence_score,
        (
          SELECT ROUND(AVG(latency_ms))
          FROM dependency_latency_history
          WHERE dependency_id = d.id
            AND recorded_at >= datetime('now', '-24 hours')
        ) as avg_latency_24h
      FROM dependencies d
      JOIN services s ON d.service_id = s.id
      LEFT JOIN dependency_associations da ON d.id = da.dependency_id AND da.is_dismissed = 0
      WHERE d.service_id = ?
    `).all(serviceId) as DependencyWithTarget[];
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
