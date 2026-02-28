import { HostnameMatchStrategy } from './HostnameMatchStrategy';
import { Dependency, Service } from '../../../db/types';

describe('HostnameMatchStrategy', () => {
  const strategy = new HostnameMatchStrategy();

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

  const createService = (name: string, healthEndpoint: string): Service => ({
    id: 'svc-2',
    name,
    team_id: 'team-1',
    health_endpoint: healthEndpoint,
    metrics_endpoint: null,
    schema_config: null,
    poll_interval_ms: 30000,
    last_poll_success: null,
    last_poll_error: null,
    poll_warnings: null,
    manifest_key: null,
    manifest_managed: 0,
    manifest_last_synced_values: null,
    is_active: 1,
    is_external: 0,
    description: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  it('should have correct name', () => {
    expect(strategy.name).toBe('HostnameMatch');
  });

  it('should match when hostnames are equal', () => {
    const dep = createDependency('https://api.example.com/users');
    const service = createService('User API', 'https://api.example.com/health');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(90);
    expect(result?.reason).toBe('Hostname match');
    expect(result?.associationType).toBe('api_call');
  });

  it('should be case insensitive', () => {
    const dep = createDependency('https://API.Example.COM/users');
    const service = createService('User API', 'https://api.example.com/health');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(90);
  });

  it('should not match different hostnames', () => {
    const dep = createDependency('https://api.example.com/users');
    const service = createService('Order API', 'https://orders.example.com/health');

    const result = strategy.match(dep, service);

    expect(result).toBeNull();
  });

  it('should not match when dependency has no hostname', () => {
    const dep = createDependency('user-service');
    const service = createService('User API', 'https://api.example.com/health');

    const result = strategy.match(dep, service);

    expect(result).toBeNull();
  });

  it('should handle different ports', () => {
    const dep = createDependency('https://api.example.com:8080/users');
    const service = createService('User API', 'https://api.example.com:3000/health');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(90);
  });

  it('should always return api_call as association type', () => {
    const dep = createDependency('https://db.example.com/postgres');
    const service = createService('DB Service', 'https://db.example.com/health');

    const result = strategy.match(dep, service);

    expect(result?.associationType).toBe('api_call');
  });
});
