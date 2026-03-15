import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

// Mock requireApiKeyAuth to inject apiKeyTeamId
const MOCK_TEAM_ID = 'team-1';
let mockApiKeyTeamId: string | undefined = MOCK_TEAM_ID;

jest.mock('../../auth/apiKeyAuth', () => ({
  requireApiKeyAuth: jest.fn((req: Record<string, unknown>, _res: unknown, next: () => void) => {
    if (mockApiKeyTeamId) {
      req.apiKeyTeamId = mockApiKeyTeamId;
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
        last_used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by TEXT,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX idx_team_api_keys_key_hash ON team_api_keys(key_hash);

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

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    mockApiKeyTeamId = MOCK_TEAM_ID;
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
