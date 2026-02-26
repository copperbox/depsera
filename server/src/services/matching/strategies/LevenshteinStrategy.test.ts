import { LevenshteinStrategy } from './LevenshteinStrategy';
import { Dependency, Service } from '../../../db/types';

describe('LevenshteinStrategy', () => {
  const strategy = new LevenshteinStrategy();

  const createDependency = (name: string): Dependency => ({
    id: 'dep-1',
    service_id: 'svc-1',
    name,
    canonical_name: null,
    description: null,
    impact: null,
    type: 'rest',
    healthy: 1,
    health_state: 0,
    health_code: 200,
    latency_ms: 50,
    contact: null,
    contact_override: null,
    impact_override: null,
    check_details: null,
    error: null,
    error_message: null,
    skipped: 0,
    last_checked: new Date().toISOString(),
    last_status_change: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const createService = (name: string): Service => ({
    id: 'svc-2',
    name,
    team_id: 'team-1',
    health_endpoint: 'http://localhost:3000/health',
    metrics_endpoint: null,
    schema_config: null,
    poll_interval_ms: 30000,
    last_poll_success: null,
    last_poll_error: null,
    poll_warnings: null,
    is_active: 1,
    is_external: 0,
    description: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  it('should have correct name', () => {
    expect(strategy.name).toBe('Levenshtein');
  });

  it('should match similar names', () => {
    const dep = createDependency('user-servce'); // typo
    const service = createService('user-service');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBeGreaterThanOrEqual(50);
    expect(result?.score).toBeLessThanOrEqual(80);
    expect(result?.reason).toContain('similar');
  });

  it('should not match very different names', () => {
    const dep = createDependency('order-service');
    const service = createService('authentication-api');

    const result = strategy.match(dep, service);

    expect(result).toBeNull();
  });

  it('should handle identical names', () => {
    const dep = createDependency('user-service');
    const service = createService('user-service');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(80); // 50 + 30 * 1.0
    expect(result?.reason).toContain('100% similar');
  });

  it('should be case insensitive', () => {
    const dep = createDependency('USER-SERVICE');
    const service = createService('user-service');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(80);
  });

  it('should match names with small edits', () => {
    const dep = createDependency('user-svc');
    const service = createService('user-service');

    const result = strategy.match(dep, service);

    // This should match as the similarity is above 60%
    expect(result).not.toBeNull();
    expect(result?.reason).toContain('similar');
  });

  it('should infer association type from dependency name', () => {
    const dep = createDependency('postgres-datbase'); // typo for database
    const service = createService('postgres-database');

    const result = strategy.match(dep, service);

    // postgres matches database keywords
    expect(result?.associationType).toBe('database');
  });
});
