import { MatchingStrategyExecutor } from './MatchingStrategyExecutor';
import { Dependency, Service } from '../../db/types';

describe('MatchingStrategyExecutor', () => {
  const executor = new MatchingStrategyExecutor();

  const createDependency = (name: string, serviceId = 'svc-1'): Dependency => ({
    id: 'dep-1',
    service_id: serviceId,
    name,
    canonical_name: null,
    description: null,
    impact: null,
    type: 'rest',
    healthy: 1,
    health_state: 0,
    health_code: 200,
    latency_ms: 50,
    check_details: null,
    error: null,
    error_message: null,
    last_checked: new Date().toISOString(),
    last_status_change: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const createService = (id: string, name: string): Service => ({
    id,
    name,
    team_id: 'team-1',
    health_endpoint: 'http://localhost:3000/health',
    metrics_endpoint: null,
    last_poll_success: null,
    last_poll_error: null,
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  describe('getStrategyNames', () => {
    it('should return all strategy names', () => {
      const names = executor.getStrategyNames();

      expect(names).toContain('ExactName');
      expect(names).toContain('HostnameMatch');
      expect(names).toContain('ContainsMatch');
      expect(names).toContain('TokenOverlap');
      expect(names).toContain('Levenshtein');
    });
  });

  describe('findBestMatch', () => {
    it('should return exact match when available', () => {
      const dep = createDependency('user-service');
      const service = createService('svc-2', 'user-service');

      const result = executor.findBestMatch(dep, service);

      expect(result).not.toBeNull();
      expect(result?.score).toBe(100);
      expect(result?.reason).toBe('Exact name match');
    });

    it('should return null when no strategies match', () => {
      const dep = createDependency('order-service');
      const service = createService('svc-2', 'authentication-gateway');

      const result = executor.findBestMatch(dep, service);

      expect(result).toBeNull();
    });

    it('should return highest scoring match', () => {
      // 'user' vs 'user-service':
      // - ContainsMatch: 80 (serviceName contains depName)
      // - TokenOverlap: 90 (100% overlap since 'user' token is in 'user-service')
      // TokenOverlap should win
      const dep = createDependency('user');
      const service = createService('svc-2', 'user-service');

      const result = executor.findBestMatch(dep, service);

      expect(result).not.toBeNull();
      expect(result?.score).toBe(90);
      expect(result?.reason).toContain('Token match');
    });
  });

  describe('findAllMatches', () => {
    it('should return matches sorted by score', () => {
      const dep = createDependency('user-api');
      const services = [
        createService('svc-2', 'order-service'),     // no match
        createService('svc-3', 'user-api'),          // exact match (100)
        createService('svc-4', 'user-api-gateway'),  // contains match (80) or token overlap (90)
      ];

      const results = executor.findAllMatches(dep, services);

      expect(results).toHaveLength(2);
      expect(results[0].serviceId).toBe('svc-3');
      expect(results[0].result.score).toBe(100);
      expect(results[1].serviceId).toBe('svc-4');
      // TokenOverlap scores 90 (100% overlap of 'user', 'api' tokens)
      expect(results[1].result.score).toBe(90);
    });

    it('should exclude services that own the dependency', () => {
      const dep = createDependency('user-api', 'svc-owner');
      const services = [
        createService('svc-owner', 'user-api'),  // Should be excluded
        createService('svc-2', 'user-api'),      // Should match
      ];

      const results = executor.findAllMatches(dep, services);

      expect(results).toHaveLength(1);
      expect(results[0].serviceId).toBe('svc-2');
    });

    it('should exclude specified service IDs', () => {
      const dep = createDependency('user-api');
      const services = [
        createService('svc-2', 'user-api'),
        createService('svc-3', 'user-api'),
      ];
      const excludeIds = new Set(['svc-2']);

      const results = executor.findAllMatches(dep, services, excludeIds);

      expect(results).toHaveLength(1);
      expect(results[0].serviceId).toBe('svc-3');
    });

    it('should only return matches above threshold', () => {
      const dep = createDependency('xyz');
      const services = [
        createService('svc-2', 'abc'), // Very different, low score
      ];

      const results = executor.findAllMatches(dep, services);

      expect(results).toHaveLength(0);
    });

    it('should include strategy name in results', () => {
      const dep = createDependency('user-api');
      const services = [createService('svc-2', 'user-api')];

      const results = executor.findAllMatches(dep, services);

      expect(results[0].strategyName).toBe('ExactName');
    });
  });
});
