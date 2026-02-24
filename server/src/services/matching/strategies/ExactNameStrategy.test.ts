import { ExactNameStrategy } from './ExactNameStrategy';
import { Dependency, Service } from '../../../db/types';

describe('ExactNameStrategy', () => {
  const strategy = new ExactNameStrategy();

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
    check_details: null,
    error: null,
    error_message: null,
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
    is_active: 1,
    is_external: 0,
    description: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  it('should have correct name', () => {
    expect(strategy.name).toBe('ExactName');
  });

  it('should match exact name (case insensitive)', () => {
    const dep = createDependency('user-service');
    const service = createService('user-service');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(100);
    expect(result?.reason).toBe('Exact name match');
  });

  it('should match with different casing', () => {
    const dep = createDependency('User-Service');
    const service = createService('user-service');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(100);
  });

  it('should not match different names', () => {
    const dep = createDependency('user-service');
    const service = createService('order-service');

    const result = strategy.match(dep, service);

    expect(result).toBeNull();
  });

  it('should not match partial names', () => {
    const dep = createDependency('user');
    const service = createService('user-service');

    const result = strategy.match(dep, service);

    expect(result).toBeNull();
  });

  it('should infer association type from dependency name', () => {
    const dep = createDependency('postgres-db');
    const service = createService('postgres-db');

    const result = strategy.match(dep, service);

    expect(result?.associationType).toBe('database');
  });
});
