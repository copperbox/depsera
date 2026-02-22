import { GraphService, getGraphService } from './GraphService';
import { ServiceTypeInferencer } from './ServiceTypeInferencer';
import { DependencyGraphBuilder } from './DependencyGraphBuilder';
import { ExternalNodeBuilder } from './ExternalNodeBuilder';
import { ServiceWithTeam, DependencyWithTarget } from './types';
import { StoreRegistry } from '../../stores';

describe('GraphService', () => {
  const mockServiceStore = {
    findActive: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    findByIdWithTeam: jest.fn(),
    findAllWithTeam: jest.fn(),
    findActiveWithTeam: jest.fn(),
    findByTeamId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    updatePollResult: jest.fn(),
    exists: jest.fn(),
    count: jest.fn(),
  };

  const mockDependencyStore = {
    findById: jest.fn(),
    findByServiceId: jest.fn(),
    findByServiceIdsWithAssociationsAndLatency: jest.fn(),
    findAllWithAssociationsAndLatency: jest.fn(),
    upsertFromPoll: jest.fn(),
    markMissing: jest.fn(),
    findByName: jest.fn(),
    findByCanonicalName: jest.fn(),
    count: jest.fn(),
  };

  const mockTeamStore = {
    findById: jest.fn(),
    findAll: jest.fn(),
    findByName: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };

  const mockStores = {
    services: mockServiceStore,
    dependencies: mockDependencyStore,
    teams: mockTeamStore,
  } as unknown as StoreRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getFullGraph', () => {
    it('should build a graph from all active services', () => {
      const service = createService('svc-1', 'User Service');
      const dep = createDependency('svc-1', null, 'rest');

      mockServiceStore.findActiveWithTeam.mockReturnValue([service]);
      mockDependencyStore.findAllWithAssociationsAndLatency.mockReturnValue([dep]);

      const graphService = new GraphService(undefined, mockStores);
      const result = graphService.getFullGraph();

      expect(result.nodes).toHaveLength(2); // service + external node
      expect(mockServiceStore.findActiveWithTeam).toHaveBeenCalled();
      expect(mockDependencyStore.findAllWithAssociationsAndLatency).toHaveBeenCalledWith({
        activeServicesOnly: true,
      });
    });
  });

  describe('getTeamGraph', () => {
    it('should return empty graph when team not found', () => {
      mockTeamStore.findById.mockReturnValue(null);

      const graphService = new GraphService(undefined, mockStores);
      const result = graphService.getTeamGraph('non-existent');

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('should return empty graph when team has no services', () => {
      mockTeamStore.findById.mockReturnValue({ id: 'team-1', name: 'Test' });
      mockServiceStore.findAllWithTeam.mockReturnValue([]);

      const graphService = new GraphService(undefined, mockStores);
      const result = graphService.getTeamGraph('team-1');

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('should include external services from other teams', () => {
      const teamService = createService('svc-1', 'Team Service');
      const externalService = createService('svc-2', 'External Service');
      externalService.team_id = 'team-2';
      externalService.team_name = 'Other Team';

      const dep = createDependency('svc-1', 'svc-2', 'rest');

      mockTeamStore.findById.mockReturnValue({ id: 'team-1', name: 'Test' });
      mockServiceStore.findAllWithTeam.mockReturnValue([teamService]);
      mockDependencyStore.findByServiceIdsWithAssociationsAndLatency.mockReturnValue([dep]);
      mockServiceStore.findByIdWithTeam.mockReturnValue(externalService);
      mockDependencyStore.findByServiceId.mockReturnValue([]);

      const graphService = new GraphService(undefined, mockStores);
      const result = graphService.getTeamGraph('team-1');

      // Should have both team's service and external service
      expect(result.nodes.length).toBeGreaterThanOrEqual(2);
      expect(mockServiceStore.findByIdWithTeam).toHaveBeenCalledWith('svc-2');
    });

    it('should skip external services that no longer exist', () => {
      const teamService = createService('svc-1', 'Team Service');
      const dep = createDependency('svc-1', 'svc-deleted', 'rest');

      mockTeamStore.findById.mockReturnValue({ id: 'team-1', name: 'Test' });
      mockServiceStore.findAllWithTeam.mockReturnValue([teamService]);
      mockDependencyStore.findByServiceIdsWithAssociationsAndLatency.mockReturnValue([dep]);
      mockServiceStore.findByIdWithTeam.mockReturnValue(undefined);

      const graphService = new GraphService(undefined, mockStores);
      const result = graphService.getTeamGraph('team-1');

      // Should only have the team's service (external not found)
      expect(result.nodes).toHaveLength(1);
    });

    it('should add external nodes for unassociated dependencies', () => {
      const teamService = createService('svc-1', 'Team Service');
      const unassociatedDep = createDependency('svc-1', null, 'cache');
      unassociatedDep.name = 'Redis';
      unassociatedDep.healthy = 1;

      mockTeamStore.findById.mockReturnValue({ id: 'team-1', name: 'Test' });
      mockServiceStore.findAllWithTeam.mockReturnValue([teamService]);
      mockDependencyStore.findByServiceIdsWithAssociationsAndLatency.mockReturnValue([unassociatedDep]);

      const graphService = new GraphService(undefined, mockStores);
      const result = graphService.getTeamGraph('team-1');

      // Should have service + external node
      expect(result.nodes).toHaveLength(2);
      const externalNode = result.nodes.find(n => n.data.isExternal);
      expect(externalNode).toBeDefined();
    });
  });

  describe('getServiceSubgraph', () => {
    it('should traverse upstream dependencies recursively', () => {
      const service1 = createService('svc-1', 'Service 1');
      const service2 = createService('svc-2', 'Service 2');
      const service3 = createService('svc-3', 'Service 3');

      const dep1to2 = createDependency('svc-1', 'svc-2', 'rest');
      const dep2to3 = createDependency('svc-2', 'svc-3', 'database');

      mockServiceStore.findByIdWithTeam
        .mockReturnValueOnce(service1)
        .mockReturnValueOnce(service2)
        .mockReturnValueOnce(service3);

      mockDependencyStore.findByServiceIdsWithAssociationsAndLatency
        .mockReturnValueOnce([dep1to2])
        .mockReturnValueOnce([dep2to3])
        .mockReturnValueOnce([]);

      const graphService = new GraphService(undefined, mockStores);
      const result = graphService.getServiceSubgraph('svc-1');

      expect(result.nodes).toHaveLength(3);
    });

    it('should return empty graph for non-existent service', () => {
      mockServiceStore.findByIdWithTeam.mockReturnValue(undefined);

      const graphService = new GraphService(undefined, mockStores);
      const result = graphService.getServiceSubgraph('non-existent');

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('should handle circular dependencies without infinite loop', () => {
      const service1 = createService('svc-1', 'Service 1');
      const service2 = createService('svc-2', 'Service 2');

      const dep1to2 = createDependency('svc-1', 'svc-2', 'rest');
      const dep2to1 = createDependency('svc-2', 'svc-1', 'rest');

      mockServiceStore.findByIdWithTeam
        .mockReturnValueOnce(service1)
        .mockReturnValueOnce(service2);

      mockDependencyStore.findByServiceIdsWithAssociationsAndLatency
        .mockReturnValueOnce([dep1to2])
        .mockReturnValueOnce([dep2to1]);

      const graphService = new GraphService(undefined, mockStores);
      const result = graphService.getServiceSubgraph('svc-1');

      // Should have both services without infinite recursion
      expect(result.nodes).toHaveLength(2);
    });
  });

  describe('getDependencySubgraph', () => {
    it('should return empty graph when dependency not found', () => {
      mockDependencyStore.findById.mockReturnValue(null);

      const graphService = new GraphService(undefined, mockStores);
      const result = graphService.getDependencySubgraph('non-existent');

      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('should delegate to getServiceSubgraph with service_id', () => {
      const dependency = {
        id: 'dep-1',
        service_id: 'svc-1',
        name: 'test-dep',
      };
      const service = createService('svc-1', 'Service 1');

      mockDependencyStore.findById.mockReturnValue(dependency);
      mockServiceStore.findByIdWithTeam.mockReturnValue(service);
      mockDependencyStore.findByServiceIdsWithAssociationsAndLatency.mockReturnValue([]);

      const graphService = new GraphService(undefined, mockStores);
      const result = graphService.getDependencySubgraph('dep-1');

      expect(result.nodes).toHaveLength(1);
      expect(mockServiceStore.findByIdWithTeam).toHaveBeenCalledWith('svc-1');
    });
  });

  describe('getGraphService singleton', () => {
    it('should return the same instance', () => {
      const instance1 = getGraphService();
      const instance2 = getGraphService();

      expect(instance1).toBe(instance2);
    });
  });
});

// Test the individual components since GraphService is mostly orchestration
// that relies on the database. Full integration tests would be done separately.

describe('GraphService components', () => {
  describe('ServiceTypeInferencer', () => {
    const inferencer = new ServiceTypeInferencer();

    it('should compute service types from dependencies', () => {
      const deps: DependencyWithTarget[] = [
        createDependency('svc-1', 'svc-2', 'database'),
        createDependency('svc-1', 'svc-2', 'database'),
        createDependency('svc-3', 'svc-2', 'rest'),
      ];

      const result = inferencer.compute(deps);

      expect(result.get('svc-2')).toBe('database');
    });
  });

  describe('DependencyGraphBuilder', () => {
    let builder: DependencyGraphBuilder;

    beforeEach(() => {
      builder = new DependencyGraphBuilder();
    });

    it('should build graph with nodes and edges', () => {
      const service1 = createService('svc-1', 'User Service');
      const service2 = createService('svc-2', 'Order Service');
      const dep = createDependency('svc-1', 'svc-2', 'rest');

      builder.addServiceNode(service1, [dep]);
      builder.addServiceNode(service2, []);
      builder.addEdge(dep);

      const graph = builder.build();

      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].source).toBe('svc-2');
      expect(graph.edges[0].target).toBe('svc-1');
    });

    it('should include edge data', () => {
      const service1 = createService('svc-1', 'User Service');
      const service2 = createService('svc-2', 'Order Service');
      const dep = createDependency('svc-1', 'svc-2', 'rest');
      dep.healthy = 1;
      dep.latency_ms = 50;

      builder.addServiceNode(service1, [dep]);
      builder.addServiceNode(service2, []);
      builder.addEdge(dep);

      const graph = builder.build();

      expect(graph.edges[0].data.dependencyType).toBe('rest');
      expect(graph.edges[0].data.healthy).toBe(true);
      expect(graph.edges[0].data.latencyMs).toBe(50);
    });
  });

  describe('External nodes in graph', () => {
    let builder: DependencyGraphBuilder;

    beforeEach(() => {
      builder = new DependencyGraphBuilder();
    });

    it('should create external nodes for unassociated deps and edges to them', () => {
      const service = createService('svc-1', 'User Service');
      const dep = createDependency('svc-1', null, 'cache');
      dep.name = 'Redis Cache';
      dep.healthy = 1;

      builder.addServiceNode(service, [dep]);

      // Simulate what GraphService.addExternalNodes does
      const groups = ExternalNodeBuilder.groupUnassociatedDeps([dep]);

      for (const [, group] of groups) {
        const nodeData = ExternalNodeBuilder.buildNodeData(group.name, group.deps);
        builder.addExternalNode(group.id, nodeData);
      }
      builder.setExternalNodeMap(ExternalNodeBuilder.buildNameToIdMap(groups));

      builder.addEdge(dep);

      const graph = builder.build();

      // Should have service node + external node
      expect(graph.nodes).toHaveLength(2);
      const externalNode = graph.nodes.find(n => n.data.isExternal);
      expect(externalNode).toBeDefined();
      expect(externalNode!.data.name).toBe('Redis Cache');
      expect(externalNode!.data.teamName).toBe('External');

      // Should have edge from external node to service
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].source).toBe(externalNode!.id);
      expect(graph.edges[0].target).toBe('svc-1');
    });

    it('should deduplicate external nodes across services', () => {
      const service1 = createService('svc-1', 'User Service');
      const service2 = createService('svc-2', 'Order Service');
      const dep1 = createDependency('svc-1', null, 'cache');
      dep1.name = 'Redis';
      dep1.healthy = 1;
      const dep2 = createDependency('svc-2', null, 'cache');
      dep2.name = 'redis'; // different case
      dep2.healthy = 0;

      builder.addServiceNode(service1, [dep1]);
      builder.addServiceNode(service2, [dep2]);

      const groups = ExternalNodeBuilder.groupUnassociatedDeps([dep1, dep2]);

      for (const [, group] of groups) {
        builder.addExternalNode(group.id, ExternalNodeBuilder.buildNodeData(group.name, group.deps));
      }
      builder.setExternalNodeMap(ExternalNodeBuilder.buildNameToIdMap(groups));

      builder.addEdge(dep1);
      builder.addEdge(dep2);

      const graph = builder.build();

      // Only 1 external node (deduped)
      const externalNodes = graph.nodes.filter(n => n.data.isExternal);
      expect(externalNodes).toHaveLength(1);
      expect(externalNodes[0].data.healthyCount).toBe(1);
      expect(externalNodes[0].data.unhealthyCount).toBe(1);

      // 2 edges from external node to both services
      expect(graph.edges).toHaveLength(2);
    });
  });
});

// Helper functions
function createService(id: string, name: string): ServiceWithTeam {
  return {
    id,
    name,
    team_id: 'team-1',
    team_name: 'Platform',
    health_endpoint: `http://${name.toLowerCase().replace(' ', '-')}.local/health`,
    metrics_endpoint: null,
    schema_config: null,
    poll_interval_ms: 30000,
    last_poll_success: null,
    last_poll_error: null,
    is_active: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

function createDependency(
  serviceId: string,
  targetServiceId: string | null,
  type: DependencyWithTarget['type']
): DependencyWithTarget {
  return {
    id: `dep-${serviceId}-${targetServiceId}`,
    service_id: serviceId,
    name: 'test-dep',
    canonical_name: null,
    description: null,
    impact: null,
    type,
    healthy: null,
    health_state: null,
    health_code: null,
    latency_ms: null,
    check_details: null,
    error: null,
    error_message: null,
    last_checked: '2024-01-01T00:00:00Z',
    last_status_change: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    service_name: 'Test Service',
    target_service_id: targetServiceId,
    association_type: 'api_call',
    is_auto_suggested: 0,
    confidence_score: 90,
    avg_latency_24h: null,
  };
}
