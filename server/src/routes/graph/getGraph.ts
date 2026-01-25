import { Request, Response } from 'express';
import db from '../../db';
import { Service, Dependency, Team, DependencyType } from '../../db/types';
import {
  GraphResponse,
  GraphNode,
  GraphEdge,
  GraphEdgeData,
  ServiceNodeData,
} from './types';

interface ServiceWithTeam extends Service {
  team_name: string;
}

interface DependencyWithTarget extends Dependency {
  service_name: string;
  target_service_id: string | null;
  association_type: string | null;
  is_auto_suggested: number | null;
  confidence_score: number | null;
  avg_latency_24h: number | null;
  // New fields for check details and errors
  check_details: string | null;
  error: string | null;
  error_message: string | null;
}

export function getGraph(req: Request, res: Response): void {
  try {
    const { team, service, dependency } = req.query;

    let graph: GraphResponse;

    if (dependency && typeof dependency === 'string') {
      graph = getDependencySubgraph(dependency);
    } else if (service && typeof service === 'string') {
      graph = getServiceSubgraph(service);
    } else if (team && typeof team === 'string') {
      graph = getTeamGraph(team);
    } else {
      graph = getFullGraph();
    }

    res.json(graph);
  } catch (error) {
    console.error('Error fetching graph:', error);
    res.status(500).json({
      error: 'Failed to fetch graph data',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

function getFullGraph(): GraphResponse {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  // Get all active services with team info
  const services = db.prepare(`
    SELECT s.*, t.name as team_name
    FROM services s
    JOIN teams t ON s.team_id = t.id
    WHERE s.is_active = 1
  `).all() as ServiceWithTeam[];

  // Get all dependencies with their associations to target services
  const dependenciesWithTargets = db.prepare(`
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

  // Group dependencies by service for counting
  const depsByService = new Map<string, typeof dependenciesWithTargets>();
  for (const dep of dependenciesWithTargets) {
    const existing = depsByService.get(dep.service_id) || [];
    existing.push(dep);
    depsByService.set(dep.service_id, existing);
  }

  // Compute service types based on incoming dependency types
  const serviceTypes = computeServiceTypes(dependenciesWithTargets);

  // Add service nodes
  for (const service of services) {
    const serviceDeps = depsByService.get(service.id) || [];
    // Dedupe by dependency id for counting
    const uniqueDeps = new Map<string, typeof serviceDeps[0]>();
    for (const dep of serviceDeps) {
      uniqueDeps.set(dep.id, dep);
    }
    const uniqueDepsList = Array.from(uniqueDeps.values());
    const healthyCount = uniqueDepsList.filter(d => d.healthy === 1).length;
    const unhealthyCount = uniqueDepsList.filter(d => d.healthy === 0).length;

    nodes.push(createServiceNode(service, uniqueDepsList.length, healthyCount, unhealthyCount, serviceTypes.get(service.id)));
    nodeIds.add(service.id);
  }

  // Add direct service-to-service edges based on dependencies with associations
  // Edge direction represents data flow: from dependency (provider) to dependent (consumer)
  for (const dep of dependenciesWithTargets) {
    if (dep.target_service_id && nodeIds.has(dep.target_service_id)) {
      // Create edge from target service (dependency) to source service (dependent)
      const edgeId = `${dep.target_service_id}-${dep.service_id}-${dep.type}`;

      // Avoid duplicate edges for same source->target->type
      if (!edgeIds.has(edgeId)) {
        edgeIds.add(edgeId);
        edges.push({
          id: edgeId,
          source: dep.target_service_id,
          target: dep.service_id,
          data: createEdgeData(dep),
        });
      }
    }
  }

  return { nodes, edges };
}

// Helper function to create edge data with all fields
function createEdgeData(dep: DependencyWithTarget): GraphEdgeData {
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

// Compute service types based on incoming dependency types
function computeServiceTypes(dependencies: DependencyWithTarget[]): Map<string, DependencyType> {
  const incomingTypes = new Map<string, Map<DependencyType, number>>();

  for (const dep of dependencies) {
    if (dep.target_service_id) {
      if (!incomingTypes.has(dep.target_service_id)) {
        incomingTypes.set(dep.target_service_id, new Map());
      }
      const typeCounts = incomingTypes.get(dep.target_service_id)!;
      typeCounts.set(dep.type, (typeCounts.get(dep.type) || 0) + 1);
    }
  }

  const serviceTypes = new Map<string, DependencyType>();
  for (const [serviceId, typeCounts] of incomingTypes) {
    // Find the most common type
    let maxCount = 0;
    let dominantType: DependencyType = 'other';
    for (const [type, count] of typeCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantType = type;
      }
    }
    serviceTypes.set(serviceId, dominantType);
  }

  return serviceTypes;
}

function getTeamGraph(teamId: string): GraphResponse {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  // Verify team exists
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) as Team | undefined;
  if (!team) {
    return { nodes: [], edges: [] };
  }

  // Get services for this team
  const services = db.prepare(`
    SELECT s.*, t.name as team_name
    FROM services s
    JOIN teams t ON s.team_id = t.id
    WHERE s.team_id = ? AND s.is_active = 1
  `).all(teamId) as ServiceWithTeam[];

  if (services.length === 0) {
    return { nodes: [], edges: [] };
  }

  const serviceIds = services.map(s => s.id);
  const placeholders = serviceIds.map(() => '?').join(',');

  // Get dependencies with their target services
  const dependenciesWithTargets = db.prepare(`
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

  // Group dependencies by service for counting
  const depsByService = new Map<string, DependencyWithTarget[]>();
  for (const dep of dependenciesWithTargets) {
    const existing = depsByService.get(dep.service_id) || [];
    existing.push(dep);
    depsByService.set(dep.service_id, existing);
  }

  // Compute service types based on incoming dependency types
  const serviceTypes = computeServiceTypes(dependenciesWithTargets);

  // Add service nodes for this team
  for (const service of services) {
    const serviceDeps = depsByService.get(service.id) || [];
    const uniqueDeps = new Map<string, DependencyWithTarget>();
    for (const dep of serviceDeps) {
      uniqueDeps.set(dep.id, dep);
    }
    const uniqueDepsList = Array.from(uniqueDeps.values());
    const healthyCount = uniqueDepsList.filter(d => d.healthy === 1).length;
    const unhealthyCount = uniqueDepsList.filter(d => d.healthy === 0).length;

    nodes.push(createServiceNode(service, uniqueDepsList.length, healthyCount, unhealthyCount, serviceTypes.get(service.id)));
    nodeIds.add(service.id);
  }

  // Collect target service IDs that are outside this team
  const externalServiceIds = new Set<string>();
  for (const dep of dependenciesWithTargets) {
    if (dep.target_service_id && !nodeIds.has(dep.target_service_id)) {
      externalServiceIds.add(dep.target_service_id);
    }
  }

  // Add external services for context
  if (externalServiceIds.size > 0) {
    const externalServices = db.prepare(`
      SELECT s.*, t.name as team_name
      FROM services s
      JOIN teams t ON s.team_id = t.id
      WHERE s.id IN (${Array.from(externalServiceIds).map(() => '?').join(',')})
    `).all(...externalServiceIds) as ServiceWithTeam[];

    for (const service of externalServices) {
      const serviceDeps = db.prepare(`
        SELECT * FROM dependencies WHERE service_id = ?
      `).all(service.id) as Dependency[];

      const healthyCount = serviceDeps.filter(d => d.healthy === 1).length;
      const unhealthyCount = serviceDeps.filter(d => d.healthy === 0).length;

      nodes.push(createServiceNode(service, serviceDeps.length, healthyCount, unhealthyCount, serviceTypes.get(service.id)));
      nodeIds.add(service.id);
    }
  }

  // Add direct service-to-service edges
  // Edge direction represents data flow: from dependency (provider) to dependent (consumer)
  for (const dep of dependenciesWithTargets) {
    if (dep.target_service_id && nodeIds.has(dep.target_service_id)) {
      const edgeId = `${dep.target_service_id}-${dep.service_id}-${dep.type}`;

      if (!edgeIds.has(edgeId)) {
        edgeIds.add(edgeId);
        edges.push({
          id: edgeId,
          source: dep.target_service_id,
          target: dep.service_id,
          data: createEdgeData(dep),
        });
      }
    }
  }

  return { nodes, edges };
}

function getServiceSubgraph(serviceId: string): GraphResponse {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const visitedServices = new Set<string>();
  const allDependencies: DependencyWithTarget[] = [];
  const serviceData: { service: ServiceWithTeam; deps: DependencyWithTarget[] }[] = [];

  // Recursively traverse upstream dependencies to collect all data
  function traverseUpstream(svcId: string): void {
    if (visitedServices.has(svcId)) return;
    visitedServices.add(svcId);

    const service = db.prepare(`
      SELECT s.*, t.name as team_name
      FROM services s
      JOIN teams t ON s.team_id = t.id
      WHERE s.id = ?
    `).get(svcId) as ServiceWithTeam | undefined;

    if (!service) return;

    // Get dependencies with their target services
    const dependenciesWithTargets = db.prepare(`
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
    `).all(svcId) as DependencyWithTarget[];

    allDependencies.push(...dependenciesWithTargets);
    serviceData.push({ service, deps: dependenciesWithTargets });

    // Process dependencies - traverse first
    for (const dep of dependenciesWithTargets) {
      if (dep.target_service_id) {
        traverseUpstream(dep.target_service_id);
      }
    }
  }

  traverseUpstream(serviceId);

  // Compute service types based on all collected dependencies
  const serviceTypes = computeServiceTypes(allDependencies);

  // Now create nodes and edges
  for (const { service, deps } of serviceData) {
    // Dedupe for counting
    const uniqueDeps = new Map<string, DependencyWithTarget>();
    for (const dep of deps) {
      uniqueDeps.set(dep.id, dep);
    }
    const uniqueDepsList = Array.from(uniqueDeps.values());
    const healthyCount = uniqueDepsList.filter(d => d.healthy === 1).length;
    const unhealthyCount = uniqueDepsList.filter(d => d.healthy === 0).length;

    // Add service node
    if (!nodeIds.has(service.id)) {
      nodes.push(createServiceNode(service, uniqueDepsList.length, healthyCount, unhealthyCount, serviceTypes.get(service.id)));
      nodeIds.add(service.id);
    }

    // Add edges (direction: from dependency to dependent, representing data flow)
    for (const dep of deps) {
      if (dep.target_service_id && nodeIds.has(dep.target_service_id)) {
        const edgeId = `${dep.target_service_id}-${dep.service_id}-${dep.type}`;
        if (!edgeIds.has(edgeId)) {
          edgeIds.add(edgeId);
          edges.push({
            id: edgeId,
            source: dep.target_service_id,
            target: dep.service_id,
            data: createEdgeData(dep),
          });
        }
      }
    }
  }

  return { nodes, edges };
}

function getDependencySubgraph(dependencyId: string): GraphResponse {
  // Get the dependency to find its owning service
  const dependency = db.prepare(`
    SELECT service_id FROM dependencies WHERE id = ?
  `).get(dependencyId) as { service_id: string } | undefined;

  if (!dependency) {
    return { nodes: [], edges: [] };
  }

  // Return the service subgraph for the owning service
  return getServiceSubgraph(dependency.service_id);
}

function createServiceNode(
  service: ServiceWithTeam,
  dependencyCount: number,
  healthyCount: number,
  unhealthyCount: number,
  serviceType?: DependencyType
): GraphNode {
  return {
    id: service.id,
    type: 'service',
    data: {
      name: service.name,
      teamId: service.team_id,
      teamName: service.team_name,
      healthEndpoint: service.health_endpoint,
      isActive: service.is_active === 1,
      dependencyCount,
      healthyCount,
      unhealthyCount,
      serviceType,
    } as ServiceNodeData,
  };
}

