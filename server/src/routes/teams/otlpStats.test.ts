import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

jest.mock('../../auth', () => ({
  requireAuth: jest.fn((_req, _res, next) => next()),
  requireAdmin: jest.fn((_req, _res, next) => next()),
  requireTeamLead: jest.fn((_req, _res, next) => next()),
}));

import teamRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/teams', teamRouter);

describe('OTLP Stats Routes', () => {
  const teamId = 'team-otlp-1';

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

      CREATE TABLE team_members (
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (team_id, user_id),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
        last_poll_success INTEGER,
        last_poll_error TEXT,
        poll_warnings TEXT,
        manifest_key TEXT,
        manifest_managed INTEGER NOT NULL DEFAULT 0,
        health_endpoint_format TEXT NOT NULL DEFAULT 'default',
        manifest_config_id TEXT,
        manifest_last_synced_values TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );

      CREATE TABLE dependencies (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        name TEXT NOT NULL,
        canonical_name TEXT,
        description TEXT,
        impact TEXT,
        type TEXT NOT NULL DEFAULT 'other',
        healthy INTEGER,
        health_state INTEGER,
        health_code INTEGER,
        latency_ms REAL,
        contact TEXT,
        contact_override TEXT,
        impact_override TEXT,
        check_details TEXT,
        error TEXT,
        error_message TEXT,
        skipped INTEGER NOT NULL DEFAULT 0,
        last_checked TEXT,
        last_status_change TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
      );

      CREATE TABLE service_poll_history (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        error TEXT,
        recorded_at TEXT NOT NULL,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
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

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by TEXT
      );
    `);

    testDb
      .prepare('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)')
      .run('user-1', 'admin@test.com', 'Admin', 'admin');

    testDb
      .prepare('INSERT INTO teams (id, name, key) VALUES (?, ?, ?)')
      .run(teamId, 'OTLP Team', 'OTLP');
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM services');
    testDb.exec('DELETE FROM dependencies');
    testDb.exec('DELETE FROM service_poll_history');
    testDb.exec('DELETE FROM team_api_keys');
  });

  describe('GET /api/teams/:id/otlp-stats', () => {
    it('should return stats for OTLP services only', async () => {
      // Insert 2 OTLP services and 1 non-OTLP
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, is_active, last_poll_success, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('svc-otlp-1', 'OTLP Svc 1', teamId, 'push://otlp', 'otlp', 1, 1, '2026-03-15T10:00:00Z');
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, is_active, last_poll_success, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('svc-otlp-2', 'OTLP Svc 2', teamId, 'push://otlp', 'otlp', 1, null, '2026-03-15T09:00:00Z');
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, is_active) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('svc-default', 'Default Svc', teamId, 'http://localhost:8080/health', 'default', 1);

      // Add a dependency to first OTLP service
      testDb.prepare(
        'INSERT INTO dependencies (id, service_id, name, type) VALUES (?, ?, ?, ?)'
      ).run('dep-1', 'svc-otlp-1', 'postgres', 'database');

      const res = await request(app).get(`/api/teams/${teamId}/otlp-stats`);

      expect(res.status).toBe(200);
      expect(res.body.services).toHaveLength(2);
      expect(res.body.services[0].name).toBe('OTLP Svc 1');
      expect(res.body.services[0].dependency_count).toBe(1);
      expect(res.body.services[1].name).toBe('OTLP Svc 2');
      expect(res.body.services[1].dependency_count).toBe(0);
      expect(res.body.summary.total_otlp_services).toBe(2);
      expect(res.body.summary.active_services).toBe(2);
      expect(res.body.summary.services_never_pushed).toBe(1);
    });

    it('should return empty when no OTLP services exist', async () => {
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, is_active) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('svc-default-2', 'Default Svc', teamId, 'http://localhost/health', 'default', 1);

      const res = await request(app).get(`/api/teams/${teamId}/otlp-stats`);

      expect(res.status).toBe(200);
      expect(res.body.services).toHaveLength(0);
      expect(res.body.summary.total_otlp_services).toBe(0);
      expect(res.body.summary.active_services).toBe(0);
    });

    it('should handle team with no services at all', async () => {
      const res = await request(app).get(`/api/teams/${teamId}/otlp-stats`);

      expect(res.status).toBe(200);
      expect(res.body.services).toEqual([]);
      expect(res.body.apiKeys).toEqual([]);
      expect(res.body.summary.total_otlp_services).toBe(0);
    });

    it('should include API keys without exposing key_hash', async () => {
      testDb.prepare(
        'INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('key-1', teamId, 'Prod Key', 'hash123', 'dps_abcd', '2026-03-15T00:00:00Z');

      const res = await request(app).get(`/api/teams/${teamId}/otlp-stats`);

      expect(res.status).toBe(200);
      expect(res.body.apiKeys).toHaveLength(1);
      expect(res.body.apiKeys[0].name).toBe('Prod Key');
      expect(res.body.apiKeys[0].key_prefix).toBe('dps_abcd');
      expect(res.body.apiKeys[0].key_hash).toBeUndefined();
    });

    it('should return error details for failing services', async () => {
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, is_active, last_poll_success, last_poll_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('svc-err', 'Failing Svc', teamId, 'push://otlp', 'otlp', 1, 0, 'Connection refused');

      const res = await request(app).get(`/api/teams/${teamId}/otlp-stats`);

      expect(res.status).toBe(200);
      expect(res.body.services[0].last_push_success).toBe(0);
      expect(res.body.services[0].last_push_error).toBe('Connection refused');
      expect(res.body.summary.services_with_errors).toBe(1);
    });

    it('should parse poll_warnings JSON', async () => {
      const warnings = JSON.stringify(['Missing metric: latency', 'Unknown label: env']);
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, is_active, last_poll_success, poll_warnings) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('svc-warn', 'Warning Svc', teamId, 'push://otlp', 'otlp', 1, 1, warnings);

      const res = await request(app).get(`/api/teams/${teamId}/otlp-stats`);

      expect(res.status).toBe(200);
      expect(res.body.services[0].last_push_warnings).toEqual([
        'Missing metric: latency',
        'Unknown label: env',
      ]);
    });

    it('should include rate limit fields on API keys', async () => {
      // Key with custom rate limit
      testDb.prepare(
        'INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix, rate_limit_rpm, rate_limit_admin_locked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('key-custom', teamId, 'Custom Key', 'hash-custom', 'dps_cust', 5000, 0, '2026-03-15T00:00:00Z');

      // Key with default (null) rate limit, admin-locked
      testDb.prepare(
        'INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix, rate_limit_rpm, rate_limit_admin_locked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('key-default', teamId, 'Default Key', 'hash-default', 'dps_dflt', null, 1, '2026-03-15T00:00:00Z');

      const res = await request(app).get(`/api/teams/${teamId}/otlp-stats`);

      expect(res.status).toBe(200);
      expect(res.body.apiKeys).toHaveLength(2);

      const customKey = res.body.apiKeys.find((k: { id: string }) => k.id === 'key-custom');
      expect(customKey.rate_limit_rpm).toBe(5000);
      expect(customKey.rate_limit_is_custom).toBe(true);
      expect(customKey.rate_limit_admin_locked).toBe(false);

      const defaultKey = res.body.apiKeys.find((k: { id: string }) => k.id === 'key-default');
      expect(defaultKey.rate_limit_rpm).toBe(150000); // system default
      expect(defaultKey.rate_limit_is_custom).toBe(false);
      expect(defaultKey.rate_limit_admin_locked).toBe(true);
    });

    it('should include usage summary fields on API keys', async () => {
      testDb.prepare(
        'INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('key-usage', teamId, 'Usage Key', 'hash-usage', 'dps_usg', '2026-03-15T00:00:00Z');

      // Insert usage buckets within the summary windows
      const now = new Date();
      const recentBucket = new Date(now.getTime() - 30 * 60 * 1000).toISOString().slice(0, 13) + ':00:00';
      const dayAgoBucket = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString().slice(0, 13) + ':00:00';

      testDb.prepare(
        'INSERT INTO api_key_usage_buckets (api_key_id, bucket_start, granularity, push_count, rejected_count) VALUES (?, ?, ?, ?, ?)'
      ).run('key-usage', recentBucket, 'hour', 100, 5);
      testDb.prepare(
        'INSERT INTO api_key_usage_buckets (api_key_id, bucket_start, granularity, push_count, rejected_count) VALUES (?, ?, ?, ?, ?)'
      ).run('key-usage', dayAgoBucket, 'hour', 200, 10);

      const res = await request(app).get(`/api/teams/${teamId}/otlp-stats`);

      expect(res.status).toBe(200);
      const key = res.body.apiKeys.find((k: { id: string }) => k.id === 'key-usage');
      expect(key.usage_1h).toBeDefined();
      expect(key.usage_24h).toBeGreaterThanOrEqual(100);
      expect(key.usage_7d).toBeGreaterThanOrEqual(300);
      expect(key.rejected_24h).toBeGreaterThanOrEqual(5);
      expect(key.rejected_7d).toBeGreaterThanOrEqual(15);
    });

    it('should return zero usage when no buckets exist', async () => {
      testDb.prepare(
        'INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('key-empty', teamId, 'Empty Key', 'hash-empty', 'dps_empt', '2026-03-15T00:00:00Z');

      const res = await request(app).get(`/api/teams/${teamId}/otlp-stats`);

      expect(res.status).toBe(200);
      const key = res.body.apiKeys.find((k: { id: string }) => k.id === 'key-empty');
      expect(key.usage_1h).toBe(0);
      expect(key.usage_24h).toBe(0);
      expect(key.usage_7d).toBe(0);
      expect(key.rejected_24h).toBe(0);
      expect(key.rejected_7d).toBe(0);
    });

    it('should count errors in last 24h', async () => {
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, is_active, last_poll_success) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run('svc-hist', 'History Svc', teamId, 'push://otlp', 'otlp', 1, 1);

      // Insert recent errors (within 24h)
      testDb.prepare(
        'INSERT INTO service_poll_history (id, service_id, error, recorded_at) VALUES (?, ?, ?, ?)'
      ).run('ph-1', 'svc-hist', 'timeout', new Date().toISOString());
      testDb.prepare(
        'INSERT INTO service_poll_history (id, service_id, error, recorded_at) VALUES (?, ?, ?, ?)'
      ).run('ph-2', 'svc-hist', 'connection reset', new Date().toISOString());
      // Insert a success (null error)
      testDb.prepare(
        'INSERT INTO service_poll_history (id, service_id, error, recorded_at) VALUES (?, ?, ?, ?)'
      ).run('ph-3', 'svc-hist', null, new Date().toISOString());

      const res = await request(app).get(`/api/teams/${teamId}/otlp-stats`);

      expect(res.status).toBe(200);
      expect(res.body.services[0].errors_24h).toBe(2);
    });
  });
});
