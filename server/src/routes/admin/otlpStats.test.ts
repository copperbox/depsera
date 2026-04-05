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
}));

import adminRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

describe('Admin OTLP Stats API', () => {
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

    testDb.prepare('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)').run('user-1', 'admin@test.com', 'Admin', 'admin');
    testDb.prepare('INSERT INTO teams (id, name, key) VALUES (?, ?, ?)').run('team-a', 'Alpha Team', 'ALPHA');
    testDb.prepare('INSERT INTO teams (id, name, key) VALUES (?, ?, ?)').run('team-b', 'Beta Team', 'BETA');
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

  describe('GET /api/admin/otlp-stats', () => {
    it('should return global OTLP stats grouped by team', async () => {
      // Alpha: 1 OTLP + 1 default
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, is_active, last_poll_success) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run('svc-a1', 'Alpha OTLP', 'team-a', 'push://otlp', 'otlp', 1, 1);
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, is_active) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('svc-a2', 'Alpha Default', 'team-a', 'http://localhost/health', 'default', 1);

      // Beta: 2 OTLP services
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, is_active, last_poll_success) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run('svc-b1', 'Beta OTLP 1', 'team-b', 'push://otlp', 'otlp', 1, 1);
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, is_active, last_poll_success) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run('svc-b2', 'Beta OTLP 2', 'team-b', 'push://otlp', 'otlp', 1, null);

      const res = await request(app).get('/api/admin/otlp-stats');

      expect(res.status).toBe(200);
      expect(res.body.teams).toHaveLength(2);

      const alphaTeam = res.body.teams.find((t: { team_id: string }) => t.team_id === 'team-a');
      const betaTeam = res.body.teams.find((t: { team_id: string }) => t.team_id === 'team-b');

      expect(alphaTeam.services).toHaveLength(1);
      expect(alphaTeam.team_name).toBe('Alpha Team');
      expect(betaTeam.services).toHaveLength(2);
      expect(betaTeam.team_name).toBe('Beta Team');

      expect(res.body.summary.total_otlp_services).toBe(3);
      expect(res.body.summary.active_services).toBe(3);
      expect(res.body.summary.services_never_pushed).toBe(1);
      expect(res.body.summary.total_teams).toBe(2);
    });

    it('should return empty when no OTLP services exist', async () => {
      const res = await request(app).get('/api/admin/otlp-stats');

      expect(res.status).toBe(200);
      expect(res.body.teams).toEqual([]);
      expect(res.body.summary.total_otlp_services).toBe(0);
      expect(res.body.summary.total_teams).toBe(0);
    });

    it('should include API keys per team', async () => {
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, is_active, last_poll_success) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run('svc-k1', 'Key OTLP', 'team-a', 'push://otlp', 'otlp', 1, 1);

      testDb.prepare(
        'INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run('key-a1', 'team-a', 'Alpha Key', 'hash-a1', 'dps_aaaa', '2026-03-15T00:00:00Z');

      const res = await request(app).get('/api/admin/otlp-stats');

      expect(res.status).toBe(200);
      const alphaTeam = res.body.teams.find((t: { team_id: string }) => t.team_id === 'team-a');
      expect(alphaTeam.apiKeys).toHaveLength(1);
      expect(alphaTeam.apiKeys[0].name).toBe('Alpha Key');
      expect(alphaTeam.apiKeys[0].key_prefix).toBe('dps_aaaa');
      expect(alphaTeam.apiKeys[0].key_hash).toBeUndefined();
    });

    it('should count error services correctly across teams', async () => {
      // Alpha: 1 healthy OTLP
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, is_active, last_poll_success) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run('svc-e1', 'Healthy', 'team-a', 'push://otlp', 'otlp', 1, 1);

      // Beta: 1 error OTLP
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, health_endpoint_format, is_active, last_poll_success, last_poll_error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('svc-e2', 'Failing', 'team-b', 'push://otlp', 'otlp', 1, 0, 'timeout');

      const res = await request(app).get('/api/admin/otlp-stats');

      expect(res.status).toBe(200);
      expect(res.body.summary.services_with_errors).toBe(1);
      expect(res.body.summary.total_otlp_services).toBe(2);
    });
  });
});
