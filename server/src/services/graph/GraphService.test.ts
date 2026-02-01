import { ServiceTypeInferencer } from './ServiceTypeInferencer';
import { DependencyGraphBuilder } from './DependencyGraphBuilder';
import { ExternalNodeBuilder } from './ExternalNodeBuilder';
import { ServiceWithTeam, DependencyWithTarget } from './types';

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
