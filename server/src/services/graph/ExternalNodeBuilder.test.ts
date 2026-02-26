import { ExternalNodeBuilder } from './ExternalNodeBuilder';
import { DependencyWithTarget } from './types';

function createDep(
  serviceId: string,
  name: string,
  targetServiceId: string | null = null,
  healthy: number | null = 1,
  type: DependencyWithTarget['type'] = 'rest'
): DependencyWithTarget {
  return {
    id: `dep-${serviceId}-${name}`,
    service_id: serviceId,
    name,
    canonical_name: null,
    description: null,
    impact: null,
    type,
    healthy,
    health_state: null,
    health_code: null,
    latency_ms: null,
    contact: null,
    contact_override: null,
    impact_override: null,
    check_details: null,
    error: null,
    error_message: null,
    skipped: 0,
    last_checked: '2024-01-01T00:00:00Z',
    last_status_change: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    service_name: 'Test Service',
    target_service_id: targetServiceId,
    association_type: null,
    is_auto_suggested: null,
    confidence_score: null,
    avg_latency_24h: null,
  };
}

describe('ExternalNodeBuilder', () => {
  describe('normalizeDepName', () => {
    it('should lowercase and trim', () => {
      expect(ExternalNodeBuilder.normalizeDepName('  Redis Cache  ')).toBe('redis cache');
    });
  });

  describe('generateExternalId', () => {
    it('should return deterministic id with external- prefix', () => {
      const id1 = ExternalNodeBuilder.generateExternalId('redis');
      const id2 = ExternalNodeBuilder.generateExternalId('redis');
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^external-[a-f0-9]{12}$/);
    });

    it('should produce different ids for different names', () => {
      const id1 = ExternalNodeBuilder.generateExternalId('redis');
      const id2 = ExternalNodeBuilder.generateExternalId('postgres');
      expect(id1).not.toBe(id2);
    });
  });

  describe('groupUnassociatedDeps', () => {
    it('should group unassociated deps by normalized name', () => {
      const deps = [
        createDep('svc-1', 'Redis Cache'),
        createDep('svc-2', 'redis cache'),
        createDep('svc-1', 'Postgres', 'svc-3'), // associated, should be skipped
      ];

      const groups = ExternalNodeBuilder.groupUnassociatedDeps(deps);

      expect(groups.size).toBe(1);
      const group = groups.get('redis cache')!;
      expect(group.deps).toHaveLength(2);
      expect(group.name).toBe('Redis Cache'); // first occurrence
    });

    it('should return empty map when all deps are associated', () => {
      const deps = [createDep('svc-1', 'Postgres', 'svc-2')];
      const groups = ExternalNodeBuilder.groupUnassociatedDeps(deps);
      expect(groups.size).toBe(0);
    });

    it('should create separate groups for different names', () => {
      const deps = [
        createDep('svc-1', 'Redis'),
        createDep('svc-1', 'Kafka'),
      ];

      const groups = ExternalNodeBuilder.groupUnassociatedDeps(deps);
      expect(groups.size).toBe(2);
    });

    it('should group deps by canonical_name when available', () => {
      const dep1 = createDep('svc-1', 'postgres-primary');
      dep1.canonical_name = 'PostgreSQL';
      const dep2 = createDep('svc-2', 'postgres-db');
      dep2.canonical_name = 'PostgreSQL';
      const dep3 = createDep('svc-3', 'pg-main');
      dep3.canonical_name = 'PostgreSQL';

      const groups = ExternalNodeBuilder.groupUnassociatedDeps([dep1, dep2, dep3]);

      expect(groups.size).toBe(1);
      const group = groups.get('postgresql')!;
      expect(group.deps).toHaveLength(3);
      expect(group.name).toBe('PostgreSQL');
    });

    it('should use original name when canonical_name is null', () => {
      const dep1 = createDep('svc-1', 'Redis');
      const dep2 = createDep('svc-2', 'redis');

      const groups = ExternalNodeBuilder.groupUnassociatedDeps([dep1, dep2]);

      expect(groups.size).toBe(1);
      const group = groups.get('redis')!;
      expect(group.deps).toHaveLength(2);
      expect(group.name).toBe('Redis');
    });

    it('should keep deps with different canonical names in separate groups', () => {
      const dep1 = createDep('svc-1', 'cache-1');
      dep1.canonical_name = 'Redis';
      const dep2 = createDep('svc-2', 'cache-2');
      dep2.canonical_name = 'Memcached';

      const groups = ExternalNodeBuilder.groupUnassociatedDeps([dep1, dep2]);

      expect(groups.size).toBe(2);
      expect(groups.has('redis')).toBe(true);
      expect(groups.has('memcached')).toBe(true);
    });
  });

  describe('buildNodeData', () => {
    it('should aggregate health counts', () => {
      const deps = [
        createDep('svc-1', 'Redis', null, 1),
        createDep('svc-2', 'Redis', null, 0),
        createDep('svc-3', 'Redis', null, null),
      ];

      const data = ExternalNodeBuilder.buildNodeData('Redis', deps);

      expect(data.healthyCount).toBe(1);
      expect(data.unhealthyCount).toBe(1);
      expect(data.dependencyCount).toBe(3);
    });

    it('should set external fields', () => {
      const deps = [createDep('svc-1', 'Redis')];
      const data = ExternalNodeBuilder.buildNodeData('Redis', deps);

      expect(data.isExternal).toBe(true);
      expect(data.teamId).toBe('external');
      expect(data.teamName).toBe('External');
      expect(data.healthEndpoint).toBe('');
      expect(data.isActive).toBe(true);
      expect(data.lastPollSuccess).toBeNull();
    });

    it('should infer service type from most common dep type', () => {
      const deps = [
        createDep('svc-1', 'Redis', null, 1, 'cache'),
        createDep('svc-2', 'Redis', null, 1, 'cache'),
        createDep('svc-3', 'Redis', null, 1, 'rest'),
      ];

      const data = ExternalNodeBuilder.buildNodeData('Redis', deps);
      expect(data.serviceType).toBe('cache');
    });
  });

  describe('buildNameToIdMap', () => {
    it('should map normalized names to external IDs', () => {
      const deps = [
        createDep('svc-1', 'Redis'),
        createDep('svc-2', 'Kafka'),
      ];

      const groups = ExternalNodeBuilder.groupUnassociatedDeps(deps);
      const map = ExternalNodeBuilder.buildNameToIdMap(groups);

      expect(map.size).toBe(2);
      expect(map.get('redis')).toMatch(/^external-/);
      expect(map.get('kafka')).toMatch(/^external-/);
    });
  });
});
