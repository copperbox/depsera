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
    expect(strategy.name).toBe('TokenOverlap');
  });

  it('should match with full token overlap', () => {
    const dep = createDependency('payment-gateway');
    const service = createService('gateway-payment');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(90); // 50 + 40 * 1.0
    expect(result?.reason).toContain('100% overlap');
  });

  it('should match with partial token overlap', () => {
    const dep = createDependency('user-payment-gateway');
    const service = createService('user-payment-processor');

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
    const dep = createDependency('user.payment.gateway');
    const service = createService('user_payment_processor');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.reason).toContain('overlap');
  });

  it('should be case insensitive', () => {
    const dep = createDependency('USER-PAYMENT');
    const service = createService('user-payment');

    const result = strategy.match(dep, service);

    expect(result).not.toBeNull();
    expect(result?.score).toBe(90);
  });

  it('should infer association type from dependency name', () => {
    const dep = createDependency('order-queue-processor');
    const service = createService('order-queue-handler');

    const result = strategy.match(dep, service);

    expect(result?.associationType).toBe('message_queue');
  });

  describe('stop word filtering', () => {
    it('should not match when only shared token is a stop word like "api"', () => {
      const dep = createDependency('eComm GraphQL API');
      const service = createService('Payment API');

      const result = strategy.match(dep, service);

      expect(result).toBeNull();
    });

    it('should not match when only shared token is "service"', () => {
      const dep = createDependency('order-service');
      const service = createService('user-service');

      const result = strategy.match(dep, service);

      expect(result).toBeNull();
    });

    it('should match when meaningful tokens overlap despite stop words', () => {
      const dep = createDependency('ecomm-payment-api');
      const service = createService('ecomm-payment-service');

      const result = strategy.match(dep, service);

      expect(result).not.toBeNull();
      expect(result?.score).toBe(90); // "ecomm" and "payment" both match
    });

    it('should not match when all tokens are stop words', () => {
      const dep = createDependency('api-service');
      const service = createService('service-api');

      const result = strategy.match(dep, service);

      expect(result).toBeNull();
    });
  });

  describe('minimum overlap count', () => {
    it('should not match with only one meaningful overlapping token', () => {
      const dep = createDependency('order-gateway');
      const service = createService('order-processor');

      const result = strategy.match(dep, service);

      // Only "order" overlaps — below minimum of 2
      expect(result).toBeNull();
    });

    it('should match with two meaningful overlapping tokens', () => {
      const dep = createDependency('order-payment-gateway');
      const service = createService('order-payment-processor');

      const result = strategy.match(dep, service);

      expect(result).not.toBeNull();
    });
  });
});
