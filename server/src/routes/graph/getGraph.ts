import { Request, Response } from 'express';
import db from '../../db';
import { Service, Dependency, DependencyAssociation, Team, HealthState } from '../../db/types';
import {
  GraphResponse,
  GraphNode,
  GraphEdge,
  ServiceNodeData,
  DependencyNodeData,
} from './types';

interface ServiceWithTeam extends Service {
  team_name: string;
}

interface DependencyWithService extends Dependency {
  service_name: string;
}

interface AssociationWithDetails extends DependencyAssociation {
  dependency_name: string;
  dependency_service_id: string;
  linked_service_name: string;
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

  // Get all active services with team info
  const services = db.prepare(`
    SELECT s.*, t.name as team_name
    FROM services s
    JOIN teams t ON s.team_id = t.id
    WHERE s.is_active = 1
  `).all() as ServiceWithTeam[];

  // Get all dependencies
  const dependencies = db.prepare(`
    SELECT d.*, s.name as service_name
    FROM dependencies d
    JOIN services s ON d.service_id = s.id
    WHERE s.is_active = 1
  `).all() as DependencyWithService[];

  // Get all non-dismissed associations
  const associations = db.prepare(`
    SELECT
      da.*,
      d.name as dependency_name,
      d.service_id as dependency_service_id,
      ls.name as linked_service_name
    FROM dependency_associations da
    JOIN dependencies d ON da.dependency_id = d.id
    JOIN services ls ON da.linked_service_id = ls.id
    WHERE da.is_dismissed = 0
  `).all() as AssociationWithDetails[];

  // Add service nodes
  for (const service of services) {
    const serviceDeps = dependencies.filter(d => d.service_id === service.id);
    const healthyCount = serviceDeps.filter(d => d.healthy === 1).length;
    const unhealthyCount = serviceDeps.filter(d => d.healthy === 0).length;

    nodes.push(createServiceNode(service, serviceDeps.length, healthyCount, unhealthyCount));
    nodeIds.add(service.id);
  }

  // Add dependency nodes and service->dependency edges
  for (const dep of dependencies) {
    nodes.push(createDependencyNode(dep));
    nodeIds.add(dep.id);

    // Edge from service to dependency (service reports this dependency)
    edges.push({
      id: `${dep.service_id}-${dep.id}`,
      source: dep.service_id,
      target: dep.id,
      data: {
        relationship: 'reports',
      },
    });
  }

  // Add association edges (dependency -> linked service)
  for (const assoc of associations) {
    // Only add edge if both nodes exist
    if (nodeIds.has(assoc.dependency_id) && nodeIds.has(assoc.linked_service_id)) {
      edges.push({
        id: assoc.id,
        source: assoc.dependency_id,
        target: assoc.linked_service_id,
        data: {
          associationType: assoc.association_type,
          isAutoSuggested: assoc.is_auto_suggested === 1,
          confidenceScore: assoc.confidence_score,
          relationship: 'depends_on',
        },
      });
    }
  }

  return { nodes, edges };
}

function getTeamGraph(teamId: string): GraphResponse {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

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

  // Get dependencies for these services
  const dependencies = db.prepare(`
    SELECT d.*, s.name as service_name
    FROM dependencies d
    JOIN services s ON d.service_id = s.id
    WHERE d.service_id IN (${placeholders})
  `).all(...serviceIds) as DependencyWithService[];

  const dependencyIds = dependencies.map(d => d.id);

  // Get associations for these dependencies
  const associations = dependencyIds.length > 0
    ? db.prepare(`
        SELECT
          da.*,
          d.name as dependency_name,
          d.service_id as dependency_service_id,
          ls.name as linked_service_name
        FROM dependency_associations da
        JOIN dependencies d ON da.dependency_id = d.id
        JOIN services ls ON da.linked_service_id = ls.id
        WHERE da.dependency_id IN (${dependencyIds.map(() => '?').join(',')})
          AND da.is_dismissed = 0
      `).all(...dependencyIds) as AssociationWithDetails[]
    : [];

  // Add service nodes
  for (const service of services) {
    const serviceDeps = dependencies.filter(d => d.service_id === service.id);
    const healthyCount = serviceDeps.filter(d => d.healthy === 1).length;
    const unhealthyCount = serviceDeps.filter(d => d.healthy === 0).length;

    nodes.push(createServiceNode(service, serviceDeps.length, healthyCount, unhealthyCount));
    nodeIds.add(service.id);
  }

  // Add dependency nodes and edges
  for (const dep of dependencies) {
    nodes.push(createDependencyNode(dep));
    nodeIds.add(dep.id);

    edges.push({
      id: `${dep.service_id}-${dep.id}`,
      source: dep.service_id,
      target: dep.id,
      data: { relationship: 'reports' },
    });
  }

  // Add linked services that are outside this team (for context)
  const linkedServiceIds = new Set(
    associations
      .map(a => a.linked_service_id)
      .filter(id => !nodeIds.has(id))
  );

  if (linkedServiceIds.size > 0) {
    const linkedServices = db.prepare(`
      SELECT s.*, t.name as team_name
      FROM services s
      JOIN teams t ON s.team_id = t.id
      WHERE s.id IN (${Array.from(linkedServiceIds).map(() => '?').join(',')})
    `).all(...linkedServiceIds) as ServiceWithTeam[];

    for (const service of linkedServices) {
      const serviceDeps = db.prepare(`
        SELECT * FROM dependencies WHERE service_id = ?
      `).all(service.id) as Dependency[];

      const healthyCount = serviceDeps.filter(d => d.healthy === 1).length;
      const unhealthyCount = serviceDeps.filter(d => d.healthy === 0).length;

      nodes.push(createServiceNode(service, serviceDeps.length, healthyCount, unhealthyCount));
      nodeIds.add(service.id);
    }
  }

  // Add association edges
  for (const assoc of associations) {
    if (nodeIds.has(assoc.dependency_id) && nodeIds.has(assoc.linked_service_id)) {
      edges.push({
        id: assoc.id,
        source: assoc.dependency_id,
        target: assoc.linked_service_id,
        data: {
          associationType: assoc.association_type,
          isAutoSuggested: assoc.is_auto_suggested === 1,
          confidenceScore: assoc.confidence_score,
          relationship: 'depends_on',
        },
      });
    }
  }

  return { nodes, edges };
}

function getServiceSubgraph(serviceId: string): GraphResponse {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();
  const visitedServices = new Set<string>();

  // Recursively traverse upstream dependencies
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

    // Get dependencies for this service
    const dependencies = db.prepare(`
      SELECT d.*, s.name as service_name
      FROM dependencies d
      JOIN services s ON d.service_id = s.id
      WHERE d.service_id = ?
    `).all(svcId) as DependencyWithService[];

    const healthyCount = dependencies.filter(d => d.healthy === 1).length;
    const unhealthyCount = dependencies.filter(d => d.healthy === 0).length;

    // Add service node
    if (!nodeIds.has(service.id)) {
      nodes.push(createServiceNode(service, dependencies.length, healthyCount, unhealthyCount));
      nodeIds.add(service.id);
    }

    // Add dependency nodes and edges
    for (const dep of dependencies) {
      if (!nodeIds.has(dep.id)) {
        nodes.push(createDependencyNode(dep));
        nodeIds.add(dep.id);
      }

      const edgeId = `${dep.service_id}-${dep.id}`;
      if (!edges.find(e => e.id === edgeId)) {
        edges.push({
          id: edgeId,
          source: dep.service_id,
          target: dep.id,
          data: { relationship: 'reports' },
        });
      }

      // Get associations for this dependency
      const associations = db.prepare(`
        SELECT
          da.*,
          d.name as dependency_name,
          d.service_id as dependency_service_id,
          ls.name as linked_service_name
        FROM dependency_associations da
        JOIN dependencies d ON da.dependency_id = d.id
        JOIN services ls ON da.linked_service_id = ls.id
        WHERE da.dependency_id = ? AND da.is_dismissed = 0
      `).all(dep.id) as AssociationWithDetails[];

      for (const assoc of associations) {
        // Recursively traverse the linked service
        traverseUpstream(assoc.linked_service_id);

        // Add association edge
        if (nodeIds.has(assoc.dependency_id) && nodeIds.has(assoc.linked_service_id)) {
          if (!edges.find(e => e.id === assoc.id)) {
            edges.push({
              id: assoc.id,
              source: assoc.dependency_id,
              target: assoc.linked_service_id,
              data: {
                associationType: assoc.association_type,
                isAutoSuggested: assoc.is_auto_suggested === 1,
                confidenceScore: assoc.confidence_score,
                relationship: 'depends_on',
              },
            });
          }
        }
      }
    }
  }

  traverseUpstream(serviceId);

  return { nodes, edges };
}

function getDependencySubgraph(dependencyId: string): GraphResponse {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  // Get the dependency
  const dependency = db.prepare(`
    SELECT d.*, s.name as service_name
    FROM dependencies d
    JOIN services s ON d.service_id = s.id
    WHERE d.id = ?
  `).get(dependencyId) as DependencyWithService | undefined;

  if (!dependency) {
    return { nodes: [], edges: [] };
  }

  // Get the owning service
  const owningService = db.prepare(`
    SELECT s.*, t.name as team_name
    FROM services s
    JOIN teams t ON s.team_id = t.id
    WHERE s.id = ?
  `).get(dependency.service_id) as ServiceWithTeam | undefined;

  if (owningService) {
    const serviceDeps = db.prepare(`
      SELECT * FROM dependencies WHERE service_id = ?
    `).all(owningService.id) as Dependency[];

    const healthyCount = serviceDeps.filter(d => d.healthy === 1).length;
    const unhealthyCount = serviceDeps.filter(d => d.healthy === 0).length;

    nodes.push(createServiceNode(owningService, serviceDeps.length, healthyCount, unhealthyCount));
    nodeIds.add(owningService.id);
  }

  // Add dependency node
  nodes.push(createDependencyNode(dependency));
  nodeIds.add(dependency.id);

  // Add edge from service to dependency
  edges.push({
    id: `${dependency.service_id}-${dependency.id}`,
    source: dependency.service_id,
    target: dependency.id,
    data: { relationship: 'reports' },
  });

  // Get associations
  const associations = db.prepare(`
    SELECT
      da.*,
      d.name as dependency_name,
      d.service_id as dependency_service_id,
      ls.name as linked_service_name
    FROM dependency_associations da
    JOIN dependencies d ON da.dependency_id = d.id
    JOIN services ls ON da.linked_service_id = ls.id
    WHERE da.dependency_id = ? AND da.is_dismissed = 0
  `).all(dependencyId) as AssociationWithDetails[];

  // Add linked services and edges
  for (const assoc of associations) {
    if (!nodeIds.has(assoc.linked_service_id)) {
      const linkedService = db.prepare(`
        SELECT s.*, t.name as team_name
        FROM services s
        JOIN teams t ON s.team_id = t.id
        WHERE s.id = ?
      `).get(assoc.linked_service_id) as ServiceWithTeam | undefined;

      if (linkedService) {
        const serviceDeps = db.prepare(`
          SELECT * FROM dependencies WHERE service_id = ?
        `).all(linkedService.id) as Dependency[];

        const healthyCount = serviceDeps.filter(d => d.healthy === 1).length;
        const unhealthyCount = serviceDeps.filter(d => d.healthy === 0).length;

        nodes.push(createServiceNode(linkedService, serviceDeps.length, healthyCount, unhealthyCount));
        nodeIds.add(linkedService.id);
      }
    }

    edges.push({
      id: assoc.id,
      source: assoc.dependency_id,
      target: assoc.linked_service_id,
      data: {
        associationType: assoc.association_type,
        isAutoSuggested: assoc.is_auto_suggested === 1,
        confidenceScore: assoc.confidence_score,
        relationship: 'depends_on',
      },
    });
  }

  return { nodes, edges };
}

function createServiceNode(
  service: ServiceWithTeam,
  dependencyCount: number,
  healthyCount: number,
  unhealthyCount: number
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
    } as ServiceNodeData,
  };
}

function createDependencyNode(dep: DependencyWithService): GraphNode {
  return {
    id: dep.id,
    type: 'dependency',
    data: {
      name: dep.name,
      serviceId: dep.service_id,
      serviceName: dep.service_name,
      description: dep.description,
      impact: dep.impact,
      type: dep.type,
      healthy: dep.healthy === null ? null : dep.healthy === 1,
      healthState: dep.health_state,
      healthCode: dep.health_code,
      latencyMs: dep.latency_ms,
      lastChecked: dep.last_checked,
    } as DependencyNodeData,
  };
}
