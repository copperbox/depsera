import { ContainsMatchStrategy } from './ContainsMatchStrategy';
import { Dependency, Service } from '../../../db/types';

describe('ContainsMatchStrategy', () => {
  const strategy = new ContainsMatchStrategy();

  const createDependency = (name: string): Dependency => ({
    id: 'dep-1',
    service_id: 'svc-1',
    name,
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

  const createService = (name: string): Service => ({
    id: 'svc-2',
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

  it('should have correct name', () => {
    expect(strategy.name).toBe('ContainsMatch');
  });

  it('should match when service name contains dependency name', () => {
    const dep = createDependency('user');
    const service = createService('user-service');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(80);
    expect(result?.reason).toBe('Name contains match');
  });

  it('should match when dependency name contains service name', () => {
    const dep = createDependency('user-service-api');
    const service = createService('user-service');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(80);
  });

  it('should be case insensitive', () => {
    const dep = createDependency('USER');
    const service = createService('user-service');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(80);
  });

  it('should not match when no containment', () => {
    const dep = createDependency('order');
    const service = createService('user-service');

    const result = strategy.match(dep, service);

    expect(result).toBeNull();
  });

  it('should infer association type from dependency name', () => {
    const dep = createDependency('kafka');
    const service = createService('kafka-broker');

    const result = strategy.match(dep, service);

    expect(result?.associationType).toBe('message_queue');
  });
});
