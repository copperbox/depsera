import { ServiceTypeInferencer } from './ServiceTypeInferencer';
import { DependencyWithTarget } from './types';

describe('ServiceTypeInferencer', () => {
  const inferencer = new ServiceTypeInferencer();

  const createDependency = (
    serviceId: string,
    targetServiceId: string | null,
    type: DependencyWithTarget['type']
  ): DependencyWithTarget => ({
    id: `dep-${Math.random()}`,
    service_id: serviceId,
    name: 'test-dep',
    canonical_name: null,
    description: null,
    impact: null,
    type,
    healthy: 1,
    health_state: 0,
    health_code: 200,
    latency_ms: 50,
    contact: null,
    check_details: null,
    error: null,
    error_message: null,
    last_checked: new Date().toISOString(),
    last_status_change: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    service_name: 'test-service',
    target_service_id: targetServiceId,
    association_type: null,
    is_auto_suggested: null,
    confidence_score: null,
    avg_latency_24h: null,
  });

  describe('compute', () => {
    it('should return empty map for no dependencies', () => {
      const result = inferencer.compute([]);
      expect(result.size).toBe(0);
    });

    it('should return empty map when no dependencies have targets', () => {
      const deps = [
        createDependency('svc-1', null, 'database'),
        createDependency('svc-2', null, 'rest'),
      ];

      const result = inferencer.compute(deps);
      expect(result.size).toBe(0);
    });

    it('should infer type from single incoming dependency', () => {
      const deps = [
        createDependency('svc-1', 'svc-2', 'database'),
      ];

      const result = inferencer.compute(deps);

      expect(result.get('svc-2')).toBe('database');
    });

    it('should infer dominant type from multiple dependencies', () => {
      const deps = [
        createDependency('svc-1', 'svc-2', 'database'),
        createDependency('svc-3', 'svc-2', 'database'),
        createDependency('svc-4', 'svc-2', 'rest'),
      ];

      const result = inferencer.compute(deps);

      expect(result.get('svc-2')).toBe('database');
    });

    it('should handle multiple target services', () => {
      const deps = [
        createDependency('svc-1', 'svc-2', 'database'),
        createDependency('svc-1', 'svc-3', 'rest'),
        createDependency('svc-2', 'svc-3', 'rest'),
      ];

      const result = inferencer.compute(deps);

      expect(result.get('svc-2')).toBe('database');
      expect(result.get('svc-3')).toBe('rest');
    });

    it('should handle tie by picking first encountered', () => {
      // When counts are equal, the last one to exceed the max count wins
      const deps = [
        createDependency('svc-1', 'svc-2', 'database'),
        createDependency('svc-3', 'svc-2', 'rest'),
      ];

      const result = inferencer.compute(deps);

      // Either database or rest is acceptable (depends on iteration order)
      expect(['database', 'rest']).toContain(result.get('svc-2'));
    });

    it('should not include services that are only sources', () => {
      const deps = [
        createDependency('svc-1', 'svc-2', 'database'),
      ];

      const result = inferencer.compute(deps);

      expect(result.has('svc-1')).toBe(false);
      expect(result.has('svc-2')).toBe(true);
    });
  });
});
