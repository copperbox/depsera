import {
  formatAssociation,
  formatDependencyWithAssociations,
  formatDependency,
  aggregateLatencyStats,
} from './dependencyFormatter';
import { Dependency, DependencyAssociation, Service } from '../../db/types';

describe('dependencyFormatter', () => {
  const mockService: Service = {
    id: 'service-1',
    name: 'Test Service',
    team_id: 'team-1',
    health_endpoint: 'https://example.com/health',
    metrics_endpoint: null,
    schema_config: null,
    poll_interval_ms: 30000,
    is_active: 1,
    is_external: 0,
    description: null,
    last_poll_success: null,
    last_poll_error: null,
    poll_warnings: null,
    manifest_key: null,
    manifest_managed: 0,
    manifest_last_synced_values: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };

  const mockAssociation: DependencyAssociation = {
    id: 'assoc-1',
    dependency_id: 'dep-1',
    linked_service_id: 'service-1',
    association_type: 'api_call',
    is_auto_suggested: 0,
    confidence_score: null,
    is_dismissed: 0,
    match_reason: null,
    manifest_managed: 0,
    created_at: '2024-01-01T00:00:00.000Z',
  };

  const mockDependency: Dependency = {
    id: 'dep-1',
    service_id: 'source-service-1',
    name: 'test-dependency',
    canonical_name: null,
    description: null,
    impact: null,
    type: 'rest',
    healthy: 1,
    health_state: 0,
    health_code: 200,
    latency_ms: 100,
    contact: null,
    contact_override: null,
    impact_override: null,
    check_details: null,
    error: null,
    error_message: null,
    skipped: 0,
    last_checked: '2024-01-01T00:00:00.000Z',
    last_status_change: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  };

  describe('formatAssociation', () => {
    it('should combine association with linked service', () => {
      const result = formatAssociation(mockAssociation, mockService);

      expect(result.id).toBe('assoc-1');
      expect(result.linked_service).toBe(mockService);
      expect(result.linked_service_id).toBe('service-1');
    });
  });

  describe('formatDependencyWithAssociations', () => {
    it('should combine dependency with associations', () => {
      const formattedAssociations = [
        { ...mockAssociation, linked_service: mockService },
      ];

      const result = formatDependencyWithAssociations(
        mockDependency,
        formattedAssociations
      );

      expect(result.id).toBe('dep-1');
      expect(result.name).toBe('test-dependency');
      expect(result.associations).toHaveLength(1);
      expect(result.associations[0].linked_service).toBe(mockService);
    });
  });

  describe('formatDependency', () => {
    it('should return a copy of the dependency', () => {
      const result = formatDependency(mockDependency);

      expect(result).toEqual(mockDependency);
      expect(result).not.toBe(mockDependency); // Should be a new object
    });
  });

  describe('aggregateLatencyStats', () => {
    it('should return null stats when no dependencies', () => {
      const result = aggregateLatencyStats([]);

      expect(result.avgLatencyMs24h).toBeNull();
      expect(result.minLatencyMs24h).toBeNull();
      expect(result.maxLatencyMs24h).toBeNull();
      expect(result.dataPointCount).toBe(0);
    });

    it('should return null stats when all latencies are null', () => {
      const dependencies: Dependency[] = [
        { ...mockDependency, latency_ms: null },
        { ...mockDependency, id: 'dep-2', latency_ms: null },
      ];

      const result = aggregateLatencyStats(dependencies);

      expect(result.avgLatencyMs24h).toBeNull();
      expect(result.minLatencyMs24h).toBeNull();
      expect(result.maxLatencyMs24h).toBeNull();
      expect(result.dataPointCount).toBe(0);
    });

    it('should calculate stats from single dependency', () => {
      const dependencies: Dependency[] = [
        { ...mockDependency, latency_ms: 150 },
      ];

      const result = aggregateLatencyStats(dependencies);

      expect(result.avgLatencyMs24h).toBe(150);
      expect(result.minLatencyMs24h).toBe(150);
      expect(result.maxLatencyMs24h).toBe(150);
      expect(result.dataPointCount).toBe(1);
    });

    it('should calculate stats from multiple dependencies', () => {
      const dependencies: Dependency[] = [
        { ...mockDependency, id: 'dep-1', latency_ms: 100 },
        { ...mockDependency, id: 'dep-2', latency_ms: 200 },
        { ...mockDependency, id: 'dep-3', latency_ms: 300 },
      ];

      const result = aggregateLatencyStats(dependencies);

      expect(result.avgLatencyMs24h).toBe(200); // (100+200+300)/3 = 200
      expect(result.minLatencyMs24h).toBe(100);
      expect(result.maxLatencyMs24h).toBe(300);
      expect(result.dataPointCount).toBe(3);
    });

    it('should filter out null latencies', () => {
      const dependencies: Dependency[] = [
        { ...mockDependency, id: 'dep-1', latency_ms: 100 },
        { ...mockDependency, id: 'dep-2', latency_ms: null },
        { ...mockDependency, id: 'dep-3', latency_ms: 200 },
      ];

      const result = aggregateLatencyStats(dependencies);

      expect(result.avgLatencyMs24h).toBe(150); // (100+200)/2 = 150
      expect(result.minLatencyMs24h).toBe(100);
      expect(result.maxLatencyMs24h).toBe(200);
      expect(result.dataPointCount).toBe(2);
    });

    it('should round average latency', () => {
      const dependencies: Dependency[] = [
        { ...mockDependency, id: 'dep-1', latency_ms: 100 },
        { ...mockDependency, id: 'dep-2', latency_ms: 101 },
      ];

      const result = aggregateLatencyStats(dependencies);

      expect(result.avgLatencyMs24h).toBe(101); // Math.round(100.5) = 101
    });
  });
});
