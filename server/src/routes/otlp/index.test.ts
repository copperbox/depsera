import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

// Mock requireApiKeyAuth to inject apiKeyTeamId and apiKeyId
const MOCK_TEAM_ID = 'team-1';
const MOCK_API_KEY_ID = 'api-key-1';
let mockApiKeyTeamId: string | undefined = MOCK_TEAM_ID;
let mockApiKeyId: string | undefined = MOCK_API_KEY_ID;

jest.mock('../../auth/apiKeyAuth', () => ({
  requireApiKeyAuth: jest.fn((req: Record<string, unknown>, _res: unknown, next: () => void) => {
    if (mockApiKeyTeamId) {
      req.apiKeyTeamId = mockApiKeyTeamId;
      req.apiKeyId = mockApiKeyId;
      next();
    } else {
      const res = _res as { status: (code: number) => { json: (body: unknown) => void } };
      res.status(401).json({ error: 'Invalid API key' });
    }
  }),
}));

// Mock HealthPollingService to avoid singleton issues in tests
const mockEmit = jest.fn();
jest.mock('../../services/polling', () => ({
  HealthPollingService: {
    getInstance: jest.fn(() => ({
      emit: mockEmit,
    })),
  },
  PollingEventType: {
    STATUS_CHANGE: 'status:change',
    POLL_COMPLETE: 'poll:complete',
    POLL_ERROR: 'poll:error',
    SERVICE_STARTED: 'service:started',
    SERVICE_STOPPED: 'service:stopped',
    CIRCUIT_OPEN: 'circuit:open',
    CIRCUIT_CLOSE: 'circuit:close',
  },
}));

import { requireApiKeyAuth } from '../../auth/apiKeyAuth';
import { createPerKeyRateLimit, evictBucket } from '../../middleware/perKeyRateLimit';
import { createTrackApiKeyUsage, _accumulator } from '../../middleware/trackApiKeyUsage';
import otlpRouter from './index';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/v1/metrics', requireApiKeyAuth, otlpRouter);

function buildOtlpPayload(
  serviceName: string,
  dependencies: Array<{
    name: string;
    status?: number;
    healthy?: number;
    latency?: number;
    code?: number;
    type?: string;
  }>,
) {
  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: serviceName } },
          ],
        },
        scopeMetrics: [
          {
            metrics: dependencies.flatMap((dep) => {
              const metrics = [];
              const attrs = [
                { key: 'dependency.name', value: { stringValue: dep.name } },
              ];
              if (dep.type) {
                attrs.push({ key: 'dependency.type', value: { stringValue: dep.type } });
              }

              if (dep.status !== undefined) {
                metrics.push({
                  name: 'dependency.health.status',
                  gauge: {
                    dataPoints: [{ asInt: String(dep.status), attributes: attrs, timeUnixNano: '1700000000000000000' }],
                  },
                });
              }
              if (dep.healthy !== undefined) {
                metrics.push({
                  name: 'dependency.health.healthy',
                  gauge: {
                    dataPoints: [{ asInt: String(dep.healthy), attributes: attrs, timeUnixNano: '1700000000000000000' }],
                  },
                });
              }
              if (dep.latency !== undefined) {
                metrics.push({
                  name: 'dependency.health.latency',
                  gauge: {
                    dataPoints: [{ asDouble: dep.latency, attributes: attrs, timeUnixNano: '1700000000000000000' }],
                  },
                });
              }
              if (dep.code !== undefined) {
                metrics.push({
                  name: 'dependency.health.code',
                  gauge: {
                    dataPoints: [{ asInt: String(dep.code), attributes: attrs, timeUnixNano: '1700000000000000000' }],
                  },
                });
              }
              return metrics;
            }),
          },
        ],
      },
    ],
  };
}

afterAll(() => {
  testDb.close();
});

describe('OTLP Receiver Route', () => {
  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT,
        oidc_subject TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        key TEXT,
        description TEXT,
        contact TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        health_endpoint TEXT NOT NULL,
        metrics_endpoint TEXT,
        schema_config TEXT,
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_external INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        health_endpoint_format TEXT NOT NULL DEFAULT 'default',
        last_poll_success INTEGER,
        last_poll_error TEXT,
        poll_warnings TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT
      );
      CREATE INDEX idx_services_team_id ON services(team_id);

      CREATE TABLE dependencies (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        name TEXT NOT NULL,
        canonical_name TEXT,
        description TEXT,
        impact TEXT,
        type TEXT DEFAULT 'other',
        healthy INTEGER,
        health_state INTEGER,
        health_code INTEGER,
        latency_ms INTEGER,
        last_checked TEXT,
        last_status_change TEXT,
        check_details TEXT,
        error TEXT,
        error_message TEXT,
        skipped INTEGER NOT NULL DEFAULT 0,
        contact TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        UNIQUE (service_id, name)
      );
      CREATE INDEX idx_dependencies_service_id ON dependencies(service_id);

      CREATE TABLE dependency_latency_history (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE
      );

      CREATE TABLE dependency_aliases (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        canonical_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE dependency_error_history (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        error TEXT,
        error_message TEXT,
        recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE
      );

      CREATE TABLE team_api_keys (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        rate_limit_rpm INTEGER,
        rate_limit_admin_locked INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by TEXT,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX idx_team_api_keys_key_hash ON team_api_keys(key_hash);

      CREATE TABLE api_key_usage_buckets (
        api_key_id      TEXT    NOT NULL,
        bucket_start    TEXT    NOT NULL,
        granularity     TEXT    NOT NULL CHECK(granularity IN ('minute', 'hour')),
        push_count      INTEGER NOT NULL DEFAULT 0,
        rejected_count  INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (api_key_id, bucket_start, granularity)
      );
      CREATE INDEX idx_usage_buckets_key_start ON api_key_usage_buckets(api_key_id, bucket_start);
      CREATE INDEX idx_usage_buckets_start ON api_key_usage_buckets(bucket_start);

      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Insert test team
    testDb.prepare('INSERT INTO teams (id, name, key) VALUES (?, ?, ?)').run(MOCK_TEAM_ID, 'Test Team', 'TEST');
  });

  beforeEach(() => {
    mockApiKeyTeamId = MOCK_TEAM_ID;
    mockApiKeyId = MOCK_API_KEY_ID;
    mockEmit.mockClear();
    // Clean up services and dependencies between tests
    testDb.exec('DELETE FROM dependency_latency_history');
    testDb.exec('DELETE FROM dependency_error_history');
    testDb.exec('DELETE FROM dependencies');
    testDb.exec('DELETE FROM services');
  });

  describe('POST /v1/metrics', () => {
    it('should accept a valid OTLP payload and return success', async () => {
      const payload = buildOtlpPayload('my-service', [
        { name: 'postgres', status: 0, healthy: 1, latency: 5, code: 200, type: 'database' },
      ]);

      const res = await request(app)
        .post('/v1/metrics')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(res.body.partialSuccess.errorMessage).toBe('');
    });

    it('should auto-register an unknown service with otlp format', async () => {
      const payload = buildOtlpPayload('auto-registered-svc', [
        { name: 'redis', status: 0, healthy: 1 },
      ]);

      await request(app)
        .post('/v1/metrics')
        .send(payload);

      const service = testDb
        .prepare('SELECT * FROM services WHERE name = ? AND team_id = ?')
        .get('auto-registered-svc', MOCK_TEAM_ID) as Record<string, unknown> | undefined;

      expect(service).toBeDefined();
      expect(service!.health_endpoint_format).toBe('otlp');
      expect(service!.health_endpoint).toBe('');
      expect(service!.poll_interval_ms).toBe(0);
      expect(service!.is_active).toBe(1);
    });

    it('should upsert dependencies for auto-registered service', async () => {
      const payload = buildOtlpPayload('dep-test-svc', [
        { name: 'postgres', status: 0, healthy: 1, latency: 12, code: 200 },
        { name: 'redis', status: 0, healthy: 1, latency: 3, code: 200 },
      ]);

      await request(app)
        .post('/v1/metrics')
        .send(payload);

      const deps = testDb
        .prepare('SELECT * FROM dependencies WHERE service_id = (SELECT id FROM services WHERE name = ?)')
        .all('dep-test-svc') as Array<Record<string, unknown>>;

      expect(deps).toHaveLength(2);
      const names = deps.map((d) => d.name);
      expect(names).toContain('postgres');
      expect(names).toContain('redis');
    });

    it('should handle idempotent push (second push updates, not duplicates)', async () => {
      const payload = buildOtlpPayload('idempotent-svc', [
        { name: 'postgres', status: 0, healthy: 1, latency: 5 },
      ]);

      await request(app).post('/v1/metrics').send(payload);
      await request(app).post('/v1/metrics').send(payload);

      const deps = testDb
        .prepare('SELECT * FROM dependencies WHERE service_id = (SELECT id FROM services WHERE name = ?)')
        .all('idempotent-svc') as Array<Record<string, unknown>>;

      expect(deps).toHaveLength(1);
    });

    it('should use existing service and warn if format is not otlp', async () => {
      // Pre-create a service with 'default' format
      testDb.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, poll_interval_ms)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('existing-svc-id', 'existing-svc', MOCK_TEAM_ID, 'http://localhost:8080/health', 'default', 30000);

      const payload = buildOtlpPayload('existing-svc', [
        { name: 'postgres', status: 0, healthy: 1 },
      ]);

      const res = await request(app)
        .post('/v1/metrics')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.partialSuccess.errorMessage).toContain('exists with format "default"');
      // Should NOT overwrite the format
      const service = testDb.prepare('SELECT * FROM services WHERE id = ?').get('existing-svc-id') as Record<string, unknown>;
      expect(service.health_endpoint_format).toBe('default');
    });

    it('should return 400 for invalid OTLP payload', async () => {
      const res = await request(app)
        .post('/v1/metrics')
        .send({ invalid: 'data' });

      expect(res.status).toBe(400);
      expect(res.body.partialSuccess.errorMessage).toBeTruthy();
    });

    it('should return 400 for missing resourceMetrics', async () => {
      const res = await request(app)
        .post('/v1/metrics')
        .send({ resourceMetrics: 'not-an-array' });

      expect(res.status).toBe(400);
    });

    it('should handle payload with multiple services', async () => {
      const payload = {
        resourceMetrics: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'svc-a' } }],
            },
            scopeMetrics: [{
              metrics: [{
                name: 'dependency.health.status',
                gauge: {
                  dataPoints: [{
                    asInt: '0',
                    attributes: [{ key: 'dependency.name', value: { stringValue: 'dep-a' } }],
                    timeUnixNano: '1700000000000000000',
                  }],
                },
              }],
            }],
          },
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'svc-b' } }],
            },
            scopeMetrics: [{
              metrics: [{
                name: 'dependency.health.status',
                gauge: {
                  dataPoints: [{
                    asInt: '0',
                    attributes: [{ key: 'dependency.name', value: { stringValue: 'dep-b' } }],
                    timeUnixNano: '1700000000000000000',
                  }],
                },
              }],
            }],
          },
        ],
      };

      const res = await request(app)
        .post('/v1/metrics')
        .send(payload);

      expect(res.status).toBe(200);

      const services = testDb
        .prepare('SELECT * FROM services WHERE team_id = ?')
        .all(MOCK_TEAM_ID) as Array<Record<string, unknown>>;

      expect(services).toHaveLength(2);
      const names = services.map((s) => s.name);
      expect(names).toContain('svc-a');
      expect(names).toContain('svc-b');
    });

    it('should handle empty dependencies gracefully', async () => {
      const payload = {
        resourceMetrics: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'empty-svc' } }],
            },
            scopeMetrics: [],
          },
        ],
      };

      const res = await request(app)
        .post('/v1/metrics')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.partialSuccess.rejectedDataPoints).toBe(0);
    });

    it('should not create service in a different team', async () => {
      // Create another team
      testDb.prepare('INSERT INTO teams (id, name, key) VALUES (?, ?, ?)').run('team-2', 'Other Team', 'OTHER');

      // Push with team-1 API key
      const payload = buildOtlpPayload('team1-svc', [
        { name: 'dep1', status: 0, healthy: 1 },
      ]);

      await request(app).post('/v1/metrics').send(payload);

      // Verify service belongs to team-1
      const service = testDb
        .prepare('SELECT * FROM services WHERE name = ?')
        .get('team1-svc') as Record<string, unknown>;
      expect(service.team_id).toBe(MOCK_TEAM_ID);

      // Clean up
      testDb.exec("DELETE FROM teams WHERE id = 'team-2'");
    });

    it('should report rejected data points on partial failure', async () => {
      // Create a payload with missing service.name — handled gracefully with warning
      const payload = {
        resourceMetrics: [
          {
            resource: { attributes: [] },
            scopeMetrics: [{
              metrics: [{
                name: 'dependency.health.status',
                gauge: {
                  dataPoints: [{
                    asInt: '0',
                    attributes: [{ key: 'dependency.name', value: { stringValue: 'dep1' } }],
                  }],
                },
              }],
            }],
          },
        ],
      };

      const res = await request(app)
        .post('/v1/metrics')
        .send(payload);

      // Should return 200 with warning about missing service.name
      expect(res.status).toBe(200);
      expect(res.body.partialSuccess.errorMessage).toContain('missing service.name');
    });
  });
});

describe('OTLP Receiver — Per-Key Rate Limiting', () => {
  // Use a fixed time so token bucket behavior is deterministic
  let testNow = 1700000000000;
  const getNow = () => testNow;

  // Separate app with the full middleware chain including per-key rate limit and usage tracking
  const rateLimitedApp = express();
  rateLimitedApp.use(express.json({ limit: '1mb' }));
  rateLimitedApp.use(
    '/v1/metrics',
    requireApiKeyAuth,
    createPerKeyRateLimit({ getNow }),
    createTrackApiKeyUsage(),
    otlpRouter,
  );

  function buildSimplePayload() {
    return {
      resourceMetrics: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'rate-limit-test-svc' } }],
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'dependency.health.status',
                  gauge: {
                    dataPoints: [
                      {
                        asInt: '0',
                        attributes: [{ key: 'dependency.name', value: { stringValue: 'dep-rl' } }],
                        timeUnixNano: '1700000000000000000',
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };
  }

  beforeEach(() => {
    mockApiKeyTeamId = MOCK_TEAM_ID;
    mockApiKeyId = MOCK_API_KEY_ID;
    testNow = 1700000000000;
    mockEmit.mockClear();
    _accumulator.clear();
    evictBucket(MOCK_API_KEY_ID);

    // Clean up test data
    testDb.exec('DELETE FROM api_key_usage_buckets');
    testDb.exec('DELETE FROM team_api_keys');
    testDb.exec('DELETE FROM dependencies');
    testDb.exec('DELETE FROM services');
  });

  it('should return 200 with RateLimit headers when within limit', async () => {
    // Insert an API key with a reasonable rate limit
    testDb.prepare(
      'INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix, rate_limit_rpm, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(MOCK_API_KEY_ID, MOCK_TEAM_ID, 'Test Key', 'hash-test', 'dps_test', 600, '2026-01-01T00:00:00Z');

    const res = await request(rateLimitedApp)
      .post('/v1/metrics')
      .send(buildSimplePayload());

    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBe('600');
    expect(res.headers['ratelimit-remaining']).toBeDefined();
    expect(res.headers['ratelimit-reset']).toBeDefined();
    expect(res.headers['x-ratelimit-key']).toBe('dps_test');
    expect(res.headers['retry-after']).toBeUndefined();
  });

  it('should return 429 with partialSuccess body when rate limit is exceeded', async () => {
    // Insert a key with very low limit: 60 rpm → burst = ceil(60/60 * 6) = 6 tokens
    testDb.prepare(
      'INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix, rate_limit_rpm, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(MOCK_API_KEY_ID, MOCK_TEAM_ID, 'Low Limit Key', 'hash-low', 'dps_low', 60, '2026-01-01T00:00:00Z');

    // Exhaust all 6 tokens (time frozen, no refill)
    for (let i = 0; i < 6; i++) {
      const res = await request(rateLimitedApp)
        .post('/v1/metrics')
        .send(buildSimplePayload());
      expect(res.status).toBe(200);
    }

    // 7th request should be rejected
    const rejectedRes = await request(rateLimitedApp)
      .post('/v1/metrics')
      .send(buildSimplePayload());

    expect(rejectedRes.status).toBe(429);
    expect(rejectedRes.body.partialSuccess).toBeDefined();
    expect(rejectedRes.body.partialSuccess.rejectedDataPoints).toBe(0);
    expect(rejectedRes.body.partialSuccess.errorMessage).toContain('Rate limit exceeded');
    expect(rejectedRes.headers['retry-after']).toBeDefined();
    expect(rejectedRes.headers['ratelimit-remaining']).toBe('0');
  });

  it('should increment rejected_count but not push_count for rejected requests', async () => {
    // 60 rpm → 6 token burst capacity
    testDb.prepare(
      'INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix, rate_limit_rpm, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(MOCK_API_KEY_ID, MOCK_TEAM_ID, 'Track Key', 'hash-track', 'dps_trk', 60, '2026-01-01T00:00:00Z');

    // Send 6 allowed requests
    for (let i = 0; i < 6; i++) {
      await request(rateLimitedApp)
        .post('/v1/metrics')
        .send(buildSimplePayload());
    }

    // Send 2 rejected requests
    await request(rateLimitedApp)
      .post('/v1/metrics')
      .send(buildSimplePayload());
    await request(rateLimitedApp)
      .post('/v1/metrics')
      .send(buildSimplePayload());

    // Check the in-memory accumulator for correctness
    let totalCount = 0;
    let totalRejected = 0;
    for (const [, entry] of _accumulator) {
      totalCount += entry.count;
      totalRejected += entry.rejected;
    }

    // 6 allowed requests tracked across 2 granularities = 12 total count entries
    // But count per-granularity should be 6
    // 2 rejected requests across 2 granularities = 4 total rejected entries
    // But rejected per-granularity should be 2
    // Total count across all entries: each allowed request increments count in 2 entries (minute+hour)
    expect(totalCount).toBe(12); // 6 requests × 2 granularities
    expect(totalRejected).toBe(4); // 2 rejections × 2 granularities
  });

  it('should not rate limit when key has rate_limit_rpm = 0 (unlimited)', async () => {
    testDb.prepare(
      'INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix, rate_limit_rpm, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(MOCK_API_KEY_ID, MOCK_TEAM_ID, 'Unlimited Key', 'hash-unlim', 'dps_unlm', 0, '2026-01-01T00:00:00Z');

    // Send many requests — all should pass
    for (let i = 0; i < 20; i++) {
      const res = await request(rateLimitedApp)
        .post('/v1/metrics')
        .send(buildSimplePayload());
      expect(res.status).toBe(200);
    }
  });

  it('should include X-RateLimit-Warning header when near limit', async () => {
    // 60 rpm → 6 token capacity. 80% threshold means warning at 5+ consumed (1 remaining)
    testDb.prepare(
      'INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix, rate_limit_rpm, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(MOCK_API_KEY_ID, MOCK_TEAM_ID, 'Warn Key', 'hash-warn', 'dps_warn', 60, '2026-01-01T00:00:00Z');

    // First request should NOT have warning (1/6 consumed = 17%)
    const firstRes = await request(rateLimitedApp)
      .post('/v1/metrics')
      .send(buildSimplePayload());
    expect(firstRes.status).toBe(200);
    expect(firstRes.headers['x-ratelimit-warning']).toBeUndefined();

    // Consume tokens until we hit the warning threshold
    for (let i = 0; i < 4; i++) {
      await request(rateLimitedApp)
        .post('/v1/metrics')
        .send(buildSimplePayload());
    }

    // 6th request: 5 consumed = 83% → should have warning
    const warnRes = await request(rateLimitedApp)
      .post('/v1/metrics')
      .send(buildSimplePayload());
    expect(warnRes.status).toBe(200);
    expect(warnRes.headers['x-ratelimit-warning']).toBe('true');
  });
});
