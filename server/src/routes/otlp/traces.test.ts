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

jest.mock('../../auth/apiKeyAuth', () => ({
  requireApiKeyAuth: jest.fn((req: Record<string, unknown>, _res: unknown, next: () => void) => {
    if (mockApiKeyTeamId) {
      req.apiKeyTeamId = mockApiKeyTeamId;
      req.apiKeyId = MOCK_API_KEY_ID;
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
import traceRouter from './traces';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/v1/traces', requireApiKeyAuth, traceRouter);

/**
 * Build an OTLP trace payload with the given spans.
 */
function buildTracePayload(
  serviceName: string,
  spans: Array<{
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
    name: string;
    kind?: number; // 1=INTERNAL, 2=SERVER, 3=CLIENT, 4=PRODUCER, 5=CONSUMER
    startTimeUnixNano?: string;
    endTimeUnixNano?: string;
    attributes?: Array<{ key: string; value: { stringValue?: string; intValue?: string } }>;
    status?: { code?: number; message?: string };
  }>,
) {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: serviceName } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'test' },
            spans: spans.map((s, i) => ({
              traceId: s.traceId ?? 'trace-001',
              spanId: s.spanId ?? `span-${i}`,
              parentSpanId: s.parentSpanId,
              name: s.name,
              kind: s.kind ?? 3, // default CLIENT
              startTimeUnixNano: s.startTimeUnixNano ?? '1700000000000000000',
              endTimeUnixNano: s.endTimeUnixNano ?? '1700000050000000000', // 50ms later
              attributes: s.attributes ?? [
                { key: 'peer.service', value: { stringValue: 'target-svc' } },
              ],
              status: s.status,
            })),
          },
        ],
      },
    ],
  };
}

afterAll(() => {
  testDb.close();
});

describe('OTLP Trace Receiver Route', () => {
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
        discovery_source TEXT NOT NULL DEFAULT 'manual',
        user_display_name TEXT,
        user_description TEXT,
        user_impact TEXT,
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

      CREATE TABLE spans (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        span_id TEXT NOT NULL,
        parent_span_id TEXT,
        service_name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        name TEXT NOT NULL,
        kind INTEGER NOT NULL DEFAULT 0,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_ms REAL NOT NULL,
        status_code INTEGER DEFAULT 0,
        status_message TEXT,
        attributes TEXT,
        resource_attributes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_spans_trace_id ON spans(trace_id);
      CREATE INDEX idx_spans_service_team ON spans(service_name, team_id);
      CREATE INDEX idx_spans_start_time ON spans(start_time);

      CREATE TABLE dependency_associations (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        linked_service_id TEXT NOT NULL,
        association_type TEXT NOT NULL DEFAULT 'other',
        is_auto_suggested INTEGER NOT NULL DEFAULT 0,
        is_dismissed INTEGER NOT NULL DEFAULT 0,
        manifest_managed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE,
        FOREIGN KEY (linked_service_id) REFERENCES services(id) ON DELETE CASCADE,
        UNIQUE (dependency_id, linked_service_id)
      );

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
    mockEmit.mockClear();
    // Clean up between tests
    testDb.exec('DELETE FROM dependency_associations');
    testDb.exec('DELETE FROM spans');
    testDb.exec('DELETE FROM dependency_latency_history');
    testDb.exec('DELETE FROM dependency_error_history');
    testDb.exec('DELETE FROM dependencies');
    testDb.exec('DELETE FROM services');
  });

  describe('POST /v1/traces', () => {
    it('should accept a valid trace payload and return success', async () => {
      const payload = buildTracePayload('my-service', [
        { name: 'GET /api/users', kind: 3, attributes: [{ key: 'peer.service', value: { stringValue: 'user-db' } }] },
      ]);

      const res = await request(app)
        .post('/v1/traces')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(res.body.partialSuccess.errorMessage).toBe('');
    });

    it('should auto-register an unknown service with otlp format', async () => {
      const payload = buildTracePayload('auto-trace-svc', [
        { name: 'db-query', kind: 3, attributes: [{ key: 'db.system', value: { stringValue: 'postgresql' } }] },
      ]);

      await request(app)
        .post('/v1/traces')
        .send(payload);

      const service = testDb
        .prepare('SELECT * FROM services WHERE name = ? AND team_id = ?')
        .get('auto-trace-svc', MOCK_TEAM_ID) as Record<string, unknown> | undefined;

      expect(service).toBeDefined();
      expect(service!.health_endpoint_format).toBe('otlp');
      expect(service!.health_endpoint).toBe('');
      expect(service!.poll_interval_ms).toBe(0);
    });

    it('should create dependencies from CLIENT spans', async () => {
      const payload = buildTracePayload('dep-trace-svc', [
        {
          name: 'SELECT users',
          kind: 3,
          attributes: [
            { key: 'peer.service', value: { stringValue: 'postgres' } },
            { key: 'db.system', value: { stringValue: 'postgresql' } },
          ],
        },
        {
          name: 'GET /api/data',
          spanId: 'span-2',
          kind: 3,
          attributes: [
            { key: 'peer.service', value: { stringValue: 'data-service' } },
            { key: 'http.request.method', value: { stringValue: 'GET' } },
          ],
        },
      ]);

      await request(app)
        .post('/v1/traces')
        .send(payload);

      const deps = testDb
        .prepare('SELECT * FROM dependencies WHERE service_id = (SELECT id FROM services WHERE name = ?)')
        .all('dep-trace-svc') as Array<Record<string, unknown>>;

      expect(deps).toHaveLength(2);
      const names = deps.map((d) => d.name);
      expect(names).toContain('postgres');
      expect(names).toContain('data-service');
    });

    it('should store ALL spans, not just CLIENT spans', async () => {
      const payload = buildTracePayload('all-spans-svc', [
        {
          name: 'client-call',
          spanId: 'span-client',
          kind: 3, // CLIENT
          attributes: [{ key: 'peer.service', value: { stringValue: 'target' } }],
        },
        {
          name: 'server-handler',
          spanId: 'span-server',
          kind: 2, // SERVER
          attributes: [],
        },
        {
          name: 'internal-op',
          spanId: 'span-internal',
          kind: 1, // INTERNAL
          attributes: [],
        },
        {
          name: 'consumer-read',
          spanId: 'span-consumer',
          kind: 5, // CONSUMER
          attributes: [],
        },
      ]);

      await request(app)
        .post('/v1/traces')
        .send(payload);

      const spans = testDb
        .prepare('SELECT * FROM spans WHERE service_name = ?')
        .all('all-spans-svc') as Array<Record<string, unknown>>;

      // All 4 spans should be stored
      expect(spans).toHaveLength(4);
      const kinds = spans.map((s) => s.kind);
      expect(kinds).toContain(1); // INTERNAL
      expect(kinds).toContain(2); // SERVER
      expect(kinds).toContain(3); // CLIENT
      expect(kinds).toContain(5); // CONSUMER
    });

    it('should create dependency when CLIENT span targets uninstrumented DB', async () => {
      const payload = buildTracePayload('db-caller-svc', [
        {
          name: 'SELECT * FROM orders',
          kind: 3,
          attributes: [
            { key: 'db.system', value: { stringValue: 'mysql' } },
            { key: 'db.operation', value: { stringValue: 'SELECT' } },
            { key: 'db.namespace', value: { stringValue: 'shop' } },
          ],
        },
      ]);

      await request(app)
        .post('/v1/traces')
        .send(payload);

      const deps = testDb
        .prepare('SELECT * FROM dependencies WHERE service_id = (SELECT id FROM services WHERE name = ?)')
        .all('db-caller-svc') as Array<Record<string, unknown>>;

      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe('mysql');
      expect(deps[0].type).toBe('database');
    });

    it('should fall back to server.address when peer.service is missing', async () => {
      const payload = buildTracePayload('fallback-svc', [
        {
          name: 'GET /health',
          kind: 3,
          attributes: [
            { key: 'server.address', value: { stringValue: 'api.example.com' } },
            { key: 'http.request.method', value: { stringValue: 'GET' } },
          ],
        },
      ]);

      await request(app)
        .post('/v1/traces')
        .send(payload);

      const deps = testDb
        .prepare('SELECT * FROM dependencies WHERE service_id = (SELECT id FROM services WHERE name = ?)')
        .all('fallback-svc') as Array<Record<string, unknown>>;

      expect(deps).toHaveLength(1);
      expect(deps[0].name).toBe('api.example.com');
      expect(deps[0].type).toBe('rest');
    });

    it('should return 400 for invalid payload structure', async () => {
      const res = await request(app)
        .post('/v1/traces')
        .send({ invalid: 'data' });

      expect(res.status).toBe(400);
      expect(res.body.partialSuccess.errorMessage).toContain('Invalid OTLP payload');
    });

    it('should return 400 for missing resourceSpans', async () => {
      const res = await request(app)
        .post('/v1/traces')
        .send({ resourceSpans: 'not-an-array' });

      expect(res.status).toBe(400);
    });

    it('should return 401 when API key auth fails', async () => {
      mockApiKeyTeamId = undefined;

      const payload = buildTracePayload('unauth-svc', [
        { name: 'call', kind: 3, attributes: [{ key: 'peer.service', value: { stringValue: 'target' } }] },
      ]);

      const res = await request(app)
        .post('/v1/traces')
        .send(payload);

      expect(res.status).toBe(401);
    });

    it('should emit status change events on health change', async () => {
      // First push: healthy
      const payload1 = buildTracePayload('events-svc', [
        {
          name: 'call-target',
          kind: 3,
          attributes: [{ key: 'peer.service', value: { stringValue: 'target-dep' } }],
          status: { code: 0 },
        },
      ]);

      await request(app).post('/v1/traces').send(payload1);

      // Second push: error status
      const payload2 = buildTracePayload('events-svc', [
        {
          name: 'call-target',
          kind: 3,
          attributes: [{ key: 'peer.service', value: { stringValue: 'target-dep' } }],
          status: { code: 2, message: 'connection refused' },
        },
      ]);

      await request(app).post('/v1/traces').send(payload2);

      // Should have emitted a status change event
      expect(mockEmit).toHaveBeenCalled();
      const emittedEvent = mockEmit.mock.calls[0];
      expect(emittedEvent[0]).toBe('status:change');
      expect(emittedEvent[1]).toMatchObject({
        serviceName: 'events-svc',
        dependencyName: 'target-dep',
        previousHealthy: true,
        currentHealthy: false,
      });
    });

    it('should handle idempotent push (second push updates, not duplicates)', async () => {
      const payload = buildTracePayload('idem-trace-svc', [
        {
          name: 'call',
          kind: 3,
          attributes: [{ key: 'peer.service', value: { stringValue: 'target' } }],
        },
      ]);

      await request(app).post('/v1/traces').send(payload);
      await request(app).post('/v1/traces').send(payload);

      const deps = testDb
        .prepare('SELECT * FROM dependencies WHERE service_id = (SELECT id FROM services WHERE name = ?)')
        .all('idem-trace-svc') as Array<Record<string, unknown>>;

      // Should have exactly 1 dependency, not 2
      expect(deps).toHaveLength(1);
    });

    it('should handle payload with missing service.name gracefully', async () => {
      const payload = {
        resourceSpans: [
          {
            resource: { attributes: [] },
            scopeSpans: [{
              spans: [{
                traceId: 'trace-1',
                spanId: 'span-1',
                name: 'test-span',
                kind: 3,
                startTimeUnixNano: '1700000000000000000',
                endTimeUnixNano: '1700000050000000000',
                attributes: [{ key: 'peer.service', value: { stringValue: 'target' } }],
              }],
            }],
          },
        ],
      };

      const res = await request(app)
        .post('/v1/traces')
        .send(payload);

      // Should succeed with a warning, not crash
      expect(res.status).toBe(200);
      expect(res.body.partialSuccess.errorMessage).toContain('service.name');
    });

    it('should store spans with correct duration_ms from nanosecond timestamps', async () => {
      const startNano = '1700000000000000000';
      const endNano = '1700000000123000000'; // 123ms later (123,000,000 ns)

      const payload = buildTracePayload('duration-svc', [
        {
          name: 'timed-call',
          kind: 3,
          startTimeUnixNano: startNano,
          endTimeUnixNano: endNano,
          attributes: [{ key: 'peer.service', value: { stringValue: 'tgt' } }],
        },
      ]);

      await request(app).post('/v1/traces').send(payload);

      const spans = testDb
        .prepare('SELECT * FROM spans WHERE service_name = ?')
        .all('duration-svc') as Array<Record<string, unknown>>;

      expect(spans).toHaveLength(1);
      expect(spans[0].duration_ms).toBe(123);
    });

    it('should store span attributes and resource attributes as JSON', async () => {
      const payload = buildTracePayload('attrs-svc', [
        {
          name: 'attr-span',
          kind: 3,
          attributes: [
            { key: 'peer.service', value: { stringValue: 'svc-target' } },
            { key: 'http.request.method', value: { stringValue: 'POST' } },
          ],
        },
      ]);

      await request(app).post('/v1/traces').send(payload);

      const spans = testDb
        .prepare('SELECT * FROM spans WHERE service_name = ?')
        .all('attrs-svc') as Array<Record<string, unknown>>;

      expect(spans).toHaveLength(1);
      // attributes should be stored as JSON string
      expect(typeof spans[0].attributes).toBe('string');
      const attrs = JSON.parse(spans[0].attributes as string);
      expect(attrs).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'peer.service' }),
      ]));
      // resource_attributes should also be JSON
      expect(typeof spans[0].resource_attributes).toBe('string');
      const resourceAttrs = JSON.parse(spans[0].resource_attributes as string);
      expect(resourceAttrs).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'service.name' }),
      ]));
    });

    it('should handle multiple services in one payload', async () => {
      const payload = {
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'trace-svc-a' } }],
            },
            scopeSpans: [{
              spans: [{
                traceId: 'trace-1',
                spanId: 'span-a',
                name: 'call-from-a',
                kind: 3,
                startTimeUnixNano: '1700000000000000000',
                endTimeUnixNano: '1700000050000000000',
                attributes: [{ key: 'peer.service', value: { stringValue: 'dep-from-a' } }],
              }],
            }],
          },
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'trace-svc-b' } }],
            },
            scopeSpans: [{
              spans: [{
                traceId: 'trace-1',
                spanId: 'span-b',
                name: 'call-from-b',
                kind: 3,
                startTimeUnixNano: '1700000000000000000',
                endTimeUnixNano: '1700000050000000000',
                attributes: [{ key: 'peer.service', value: { stringValue: 'dep-from-b' } }],
              }],
            }],
          },
        ],
      };

      const res = await request(app)
        .post('/v1/traces')
        .send(payload);

      expect(res.status).toBe(200);

      const services = testDb
        .prepare('SELECT * FROM services WHERE team_id = ?')
        .all(MOCK_TEAM_ID) as Array<Record<string, unknown>>;

      expect(services).toHaveLength(2);
      const names = services.map((s) => s.name);
      expect(names).toContain('trace-svc-a');
      expect(names).toContain('trace-svc-b');
    });

    it('should auto-associate when trace from A calls registered service B', async () => {
      // Pre-register service B in the same team
      testDb.prepare(
        `INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, poll_interval_ms, is_active, is_external)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('svc-b', 'service-b', MOCK_TEAM_ID, '', 'otlp', 0, 1, 0);

      // Service A sends a trace with a CLIENT span calling service-b
      const payload = buildTracePayload('service-a', [
        {
          name: 'call-service-b',
          kind: 3,
          attributes: [
            { key: 'peer.service', value: { stringValue: 'service-b' } },
            { key: 'http.request.method', value: { stringValue: 'GET' } },
          ],
        },
      ]);

      await request(app).post('/v1/traces').send(payload);

      const associations = testDb
        .prepare('SELECT * FROM dependency_associations')
        .all() as Array<Record<string, unknown>>;

      expect(associations).toHaveLength(1);
      expect(associations[0].linked_service_id).toBe('svc-b');
      expect(associations[0].is_auto_suggested).toBe(1);
      expect(associations[0].association_type).toBe('api_call');
    });

    it('should not auto-associate when trace targets unregistered service', async () => {
      // No pre-registered services — the target is unknown
      const payload = buildTracePayload('service-a', [
        {
          name: 'call-unknown',
          kind: 3,
          attributes: [
            { key: 'peer.service', value: { stringValue: 'unknown-service' } },
          ],
        },
      ]);

      await request(app).post('/v1/traces').send(payload);

      const associations = testDb
        .prepare('SELECT * FROM dependency_associations')
        .all() as Array<Record<string, unknown>>;

      expect(associations).toHaveLength(0);
    });

    it('should not create duplicate associations on repeated trace pushes', async () => {
      // Pre-register service B
      testDb.prepare(
        `INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, poll_interval_ms, is_active, is_external)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run('svc-b', 'service-b', MOCK_TEAM_ID, '', 'otlp', 0, 1, 0);

      const payload = buildTracePayload('service-a', [
        {
          name: 'call-service-b',
          kind: 3,
          attributes: [{ key: 'peer.service', value: { stringValue: 'service-b' } }],
        },
      ]);

      // Push twice
      await request(app).post('/v1/traces').send(payload);
      await request(app).post('/v1/traces').send(payload);

      const associations = testDb
        .prepare('SELECT * FROM dependency_associations')
        .all() as Array<Record<string, unknown>>;

      // Should have exactly 1, not 2
      expect(associations).toHaveLength(1);
    });

    it('should only create dependencies from CLIENT/PRODUCER spans, not SERVER/INTERNAL', async () => {
      const payload = buildTracePayload('kind-filter-svc', [
        {
          name: 'client-call',
          spanId: 'span-client',
          kind: 3, // CLIENT — should create dep
          attributes: [{ key: 'peer.service', value: { stringValue: 'client-target' } }],
        },
        {
          name: 'producer-send',
          spanId: 'span-producer',
          kind: 4, // PRODUCER — should create dep
          attributes: [{ key: 'messaging.system', value: { stringValue: 'kafka' } }],
        },
        {
          name: 'server-handle',
          spanId: 'span-server',
          kind: 2, // SERVER — should NOT create dep
          attributes: [{ key: 'peer.service', value: { stringValue: 'server-target' } }],
        },
        {
          name: 'internal-work',
          spanId: 'span-internal',
          kind: 1, // INTERNAL — should NOT create dep
          attributes: [{ key: 'peer.service', value: { stringValue: 'internal-target' } }],
        },
      ]);

      await request(app).post('/v1/traces').send(payload);

      const deps = testDb
        .prepare('SELECT * FROM dependencies WHERE service_id = (SELECT id FROM services WHERE name = ?)')
        .all('kind-filter-svc') as Array<Record<string, unknown>>;

      expect(deps).toHaveLength(2);
      const names = deps.map((d) => d.name);
      expect(names).toContain('client-target');
      expect(names).toContain('kafka');
      expect(names).not.toContain('server-target');
      expect(names).not.toContain('internal-target');
    });
  });
});
