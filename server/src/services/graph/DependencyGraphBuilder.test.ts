import { DependencyGraphBuilder } from './DependencyGraphBuilder';
import { ServiceWithTeam, DependencyWithTarget } from './types';

describe('DependencyGraphBuilder', () => {
  let builder: DependencyGraphBuilder;

  const createService = (id: string, name: string): ServiceWithTeam => ({
    id,
    name,
    team_id: 'team-1',
    team_name: 'Test Team',
    health_endpoint: `http://${name}.local/health`,
    metrics_endpoint: null,
    last_poll_success: null,
    last_poll_error: null,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const createDependency = (
    serviceId: string,
    targetServiceId: string | null,
    type: DependencyWithTarget['type'] = 'rest'
  ): DependencyWithTarget => ({
    id: `dep-${serviceId}-${targetServiceId}`,
    service_id: serviceId,
    name: 'test-dep',
    description: null,
    impact: null,
    type,
    healthy: 1,
    health_state: 0,
    health_code: 200,
    latency_ms: 50,
    check_details: '{"query": "SELECT 1"}',
    error: null,
    error_message: null,
    last_checked: new Date().toISOString(),
    last_status_change: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    service_name: 'test-service',
    target_service_id: targetServiceId,
    association_type: 'api_call',
    is_auto_suggested: 0,
    confidence_score: 90,
    avg_latency_24h: 45,
  });

  beforeEach(() => {
    builder = new DependencyGraphBuilder();
  });

  describe('addServiceNode', () => {
    it('should add a service node', () => {
      const service = createService('svc-1', 'User Service');

      builder.addServiceNode(service, []);
      const graph = builder.build();

      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0].id).toBe('svc-1');
      expect(graph.nodes[0].type).toBe('service');
      expect(graph.nodes[0].data.name).toBe('User Service');
    });

    it('should calculate dependency counts', () => {
      const service = createService('svc-1', 'User Service');
      const deps = [
        createDependency('svc-1', 'svc-2'),
        createDependency('svc-1', 'svc-3'),
      ];
      deps[0].healthy = 1;
      deps[1].healthy = 0;

      builder.addServiceNode(service, deps);
      const graph = builder.build();

      expect(graph.nodes[0].data.dependencyCount).toBe(2);
      expect(graph.nodes[0].data.healthyCount).toBe(1);
      expect(graph.nodes[0].data.unhealthyCount).toBe(1);
    });

    it('should deduplicate dependencies for counting', () => {
      const service = createService('svc-1', 'User Service');
      const dep1 = createDependency('svc-1', 'svc-2');
      const dep2 = { ...dep1 }; // Same ID, should be deduped

      builder.addServiceNode(service, [dep1, dep2]);
      const graph = builder.build();

      expect(graph.nodes[0].data.dependencyCount).toBe(1);
    });

    it('should not add duplicate nodes', () => {
      const service = createService('svc-1', 'User Service');

      builder.addServiceNode(service, []);
      builder.addServiceNode(service, []);
      const graph = builder.build();

      expect(graph.nodes).toHaveLength(1);
    });

    it('should include service type', () => {
      const service = createService('svc-1', 'User Service');

      builder.addServiceNode(service, [], 'database');
      const graph = builder.build();

      expect(graph.nodes[0].data.serviceType).toBe('database');
    });
  });

  describe('addEdge', () => {
    it('should add an edge between nodes', () => {
      const service1 = createService('svc-1', 'User Service');
      const service2 = createService('svc-2', 'Order Service');
      const dep = createDependency('svc-1', 'svc-2');

      builder.addServiceNode(service1, []);
      builder.addServiceNode(service2, []);
      builder.addEdge(dep);
      const graph = builder.build();

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].source).toBe('svc-2');
      expect(graph.edges[0].target).toBe('svc-1');
    });

    it('should not add edge when target node does not exist', () => {
      const service1 = createService('svc-1', 'User Service');
      const dep = createDependency('svc-1', 'svc-2');

      builder.addServiceNode(service1, []);
      builder.addEdge(dep);
      const graph = builder.build();

      expect(graph.edges).toHaveLength(0);
    });

    it('should not add edge when target_service_id is null', () => {
      const service1 = createService('svc-1', 'User Service');
      const dep = createDependency('svc-1', null);

      builder.addServiceNode(service1, []);
      builder.addEdge(dep);
      const graph = builder.build();

      expect(graph.edges).toHaveLength(0);
    });

    it('should not add duplicate edges', () => {
      const service1 = createService('svc-1', 'User Service');
      const service2 = createService('svc-2', 'Order Service');
      const dep1 = createDependency('svc-1', 'svc-2');
      const dep2 = createDependency('svc-1', 'svc-2');

      builder.addServiceNode(service1, []);
      builder.addServiceNode(service2, []);
      builder.addEdge(dep1);
      builder.addEdge(dep2);
      const graph = builder.build();

      expect(graph.edges).toHaveLength(1);
    });

    it('should include edge data', () => {
      const service1 = createService('svc-1', 'User Service');
      const service2 = createService('svc-2', 'Order Service');
      const dep = createDependency('svc-1', 'svc-2', 'database');

      builder.addServiceNode(service1, []);
      builder.addServiceNode(service2, []);
      builder.addEdge(dep);
      const graph = builder.build();

      expect(graph.edges[0].data.dependencyType).toBe('database');
      expect(graph.edges[0].data.healthy).toBe(true);
      expect(graph.edges[0].data.avgLatencyMs24h).toBe(45);
      expect(graph.edges[0].data.checkDetails).toEqual({ query: 'SELECT 1' });
    });
  });

  describe('hasNode', () => {
    it('should return true for existing node', () => {
      const service = createService('svc-1', 'User Service');
      builder.addServiceNode(service, []);

      expect(builder.hasNode('svc-1')).toBe(true);
    });

    it('should return false for non-existing node', () => {
      expect(builder.hasNode('svc-1')).toBe(false);
    });
  });

  describe('addExternalNode', () => {
    it('should add an external node', () => {
      builder.addExternalNode('external-abc', {
        name: 'Redis',
        teamId: 'external',
        teamName: 'External',
        healthEndpoint: '',
        isActive: true,
        dependencyCount: 2,
        healthyCount: 2,
        unhealthyCount: 0,
        lastPollSuccess: null,
        lastPollError: null,
        isExternal: true,
      });

      const graph = builder.build();
      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0].id).toBe('external-abc');
      expect(graph.nodes[0].data.isExternal).toBe(true);
    });

    it('should not add duplicate external nodes', () => {
      const data = {
        name: 'Redis',
        teamId: 'external',
        teamName: 'External',
        healthEndpoint: '',
        isActive: true,
        dependencyCount: 1,
        healthyCount: 1,
        unhealthyCount: 0,
        lastPollSuccess: null,
        lastPollError: null,
        isExternal: true as const,
      };

      builder.addExternalNode('external-abc', data);
      builder.addExternalNode('external-abc', data);

      const graph = builder.build();
      expect(graph.nodes).toHaveLength(1);
    });
  });

  describe('addEdge with external node map', () => {
    it('should create edge to external node for unassociated dep', () => {
      const service = createService('svc-1', 'User Service');
      builder.addServiceNode(service, []);
      builder.addExternalNode('external-redis', {
        name: 'Redis',
        teamId: 'external',
        teamName: 'External',
        healthEndpoint: '',
        isActive: true,
        dependencyCount: 1,
        healthyCount: 1,
        unhealthyCount: 0,
        lastPollSuccess: null,
        lastPollError: null,
        isExternal: true,
      });

      builder.setExternalNodeMap(new Map([['redis', 'external-redis']]));

      const dep = createDependency('svc-1', null);
      dep.name = 'Redis';
      builder.addEdge(dep);

      const graph = builder.build();
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].source).toBe('external-redis');
      expect(graph.edges[0].target).toBe('svc-1');
    });

    it('should not create edge if no external node map set', () => {
      const service = createService('svc-1', 'User Service');
      builder.addServiceNode(service, []);

      const dep = createDependency('svc-1', null);
      dep.name = 'Redis';
      builder.addEdge(dep);

      const graph = builder.build();
      expect(graph.edges).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('should clear all nodes and edges', () => {
      const service = createService('svc-1', 'User Service');
      builder.addServiceNode(service, []);

      builder.reset();
      const graph = builder.build();

      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
      expect(builder.hasNode('svc-1')).toBe(false);
    });
  });
});
