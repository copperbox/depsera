import { TokenOverlapStrategy } from './TokenOverlapStrategy';
import { Dependency, Service } from '../../../db/types';

describe('TokenOverlapStrategy', () => {
  const strategy = new TokenOverlapStrategy();

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
    expect(strategy.name).toBe('TokenOverlap');
  });

  it('should match with full token overlap', () => {
    const dep = createDependency('user-api');
    const service = createService('api-user');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(90); // 50 + 40 * 1.0
    expect(result?.reason).toContain('100% overlap');
  });

  it('should match with partial token overlap', () => {
    const dep = createDependency('user-api-gateway');
    const service = createService('user-service');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBeGreaterThanOrEqual(50);
    expect(result?.score).toBeLessThanOrEqual(90);
    expect(result?.reason).toContain('overlap');
  });

  it('should not match with no token overlap', () => {
    const dep = createDependency('order-payment');
    const service = createService('user-authentication');

    const result = strategy.match(dep, service);

    expect(result).toBeNull();
  });

  it('should handle different token delimiters', () => {
    const dep = createDependency('user.api.gateway');
    const service = createService('user_api_service');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.reason).toContain('overlap');
  });

  it('should be case insensitive', () => {
    const dep = createDependency('USER-API');
    const service = createService('user-api');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(90);
  });

  it('should infer association type from dependency name', () => {
    const dep = createDependency('order-queue-processor');
    const service = createService('order-handler');

    const result = strategy.match(dep, service);

    expect(result?.associationType).toBe('message_queue');
  });
});
