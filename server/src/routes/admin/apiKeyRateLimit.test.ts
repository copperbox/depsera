import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

interface TestUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

const adminUser: TestUser = {
  id: 'admin-1',
  email: 'admin@test.com',
  name: 'Admin User',
  role: 'admin',
};

const regularUser: TestUser = {
  id: 'user-1',
  email: 'user@test.com',
  name: 'Regular User',
  role: 'user',
};

let currentUser: TestUser = adminUser;

jest.mock('../../auth', () => ({
  requireAuth: jest.fn((req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.user = currentUser;
    req.session = { userId: currentUser.id };
    next();
  }),
  requireAdmin: jest.fn(
    (
      req: Record<string, unknown>,
      res: { status: (code: number) => { json: (body: unknown) => void } },
      next: () => void,
    ) => {
      req.user = currentUser;
      req.session = { userId: currentUser.id };

      if (currentUser.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }
      next();
    },
  ),
  requireTeamLead: jest.fn(
    (
      req: Record<string, unknown>,
      res: { status: (code: number) => { json: (body: unknown) => void } },
      next: () => void,
    ) => {
      req.user = currentUser;
      req.session = { userId: currentUser.id };

      if (currentUser.role === 'admin') {
        next();
        return;
      }

      const teamId = (req.params as Record<string, string>).id;
      const membership = testDb
        .prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?')
        .get(teamId, currentUser.id) as { role: string } | undefined;
      if (!membership || membership.role !== 'lead') {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      next();
    },
  ),
}));

import adminRouter from './index';
import teamRouter from '../teams/index';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);
app.use('/api/teams', teamRouter);

describe('Admin API Key Rate Limit Routes', () => {
  const teamId = 'team-1';

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
    `);

    const insertUser = testDb.prepare(
      'INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)',
    );
    insertUser.run(adminUser.id, adminUser.email, adminUser.name, adminUser.role);
    insertUser.run(regularUser.id, regularUser.email, regularUser.name, regularUser.role);

    testDb.prepare('INSERT INTO teams (id, name, key) VALUES (?, ?, ?)').run(teamId, 'Test Team', 'TEST');

    // Regular user is a lead on team-1 (for lock propagation tests)
    testDb.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(teamId, regularUser.id, 'lead');
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    currentUser = adminUser;
    testDb.exec('DELETE FROM team_api_keys');
  });

  function insertApiKey(
    id: string,
    opts: { rate_limit_rpm?: number | null; rate_limit_admin_locked?: number } = {},
  ) {
    testDb.prepare(
      'INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix, rate_limit_rpm, rate_limit_admin_locked, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      id, teamId, `Key ${id}`, `hash-${id}`, 'dps_test',
      opts.rate_limit_rpm ?? null,
      opts.rate_limit_admin_locked ?? 0,
      '2026-01-01T00:00:00Z',
    );
  }

  describe('PATCH /api/admin/api-keys/:keyId/rate-limit', () => {
    it('should allow admin to set rate_limit_rpm to 0 (unlimited)', async () => {
      insertApiKey('key-1');

      const res = await request(app)
        .patch('/api/admin/api-keys/key-1/rate-limit')
        .send({ rate_limit_rpm: 0 });

      expect(res.status).toBe(200);
      expect(res.body.rate_limit_rpm).toBe(0);
      expect(res.body.key_hash).toBeUndefined();
    });

    it('should allow admin to set a custom rate limit', async () => {
      insertApiKey('key-1');

      const res = await request(app)
        .patch('/api/admin/api-keys/key-1/rate-limit')
        .send({ rate_limit_rpm: 50000 });

      expect(res.status).toBe(200);
      expect(res.body.rate_limit_rpm).toBe(50000);
    });

    it('should allow admin to reset rate limit to null (default)', async () => {
      insertApiKey('key-1', { rate_limit_rpm: 5000 });

      const res = await request(app)
        .patch('/api/admin/api-keys/key-1/rate-limit')
        .send({ rate_limit_rpm: null });

      expect(res.status).toBe(200);
      expect(res.body.rate_limit_rpm).toBeNull();
    });

    it('should allow admin to lock a key', async () => {
      insertApiKey('key-1');

      const res = await request(app)
        .patch('/api/admin/api-keys/key-1/rate-limit')
        .send({ rate_limit_rpm: 1000, admin_locked: true });

      expect(res.status).toBe(200);
      expect(res.body.rate_limit_admin_locked).toBe(1);
      expect(res.body.rate_limit_rpm).toBe(1000);
    });

    it('should allow admin to unlock a key', async () => {
      insertApiKey('key-1', { rate_limit_admin_locked: 1, rate_limit_rpm: 1000 });

      const res = await request(app)
        .patch('/api/admin/api-keys/key-1/rate-limit')
        .send({ admin_locked: false });

      expect(res.status).toBe(200);
      expect(res.body.rate_limit_admin_locked).toBe(0);
      // rate_limit_rpm should remain unchanged
      expect(res.body.rate_limit_rpm).toBe(1000);
    });

    it('should return 404 for nonexistent key', async () => {
      const res = await request(app)
        .patch('/api/admin/api-keys/nonexistent/rate-limit')
        .send({ rate_limit_rpm: 5000 });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('API key not found');
    });

    it('should return 400 for negative rate_limit_rpm', async () => {
      insertApiKey('key-1');

      const res = await request(app)
        .patch('/api/admin/api-keys/key-1/rate-limit')
        .send({ rate_limit_rpm: -100 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('non-negative integer or null');
    });

    it('should return 400 for non-integer rate_limit_rpm', async () => {
      insertApiKey('key-1');

      const res = await request(app)
        .patch('/api/admin/api-keys/key-1/rate-limit')
        .send({ rate_limit_rpm: 3.14 });

      expect(res.status).toBe(400);
    });

    it('should deny non-admin users', async () => {
      currentUser = regularUser;
      insertApiKey('key-1');

      const res = await request(app)
        .patch('/api/admin/api-keys/key-1/rate-limit')
        .send({ rate_limit_rpm: 5000 });

      expect(res.status).toBe(403);
    });

    it('should block team PATCH after admin locks a key', async () => {
      // Admin locks the key
      insertApiKey('key-1');

      const lockRes = await request(app)
        .patch('/api/admin/api-keys/key-1/rate-limit')
        .send({ rate_limit_rpm: 1000, admin_locked: true });

      expect(lockRes.status).toBe(200);
      expect(lockRes.body.rate_limit_admin_locked).toBe(1);

      // Team lead tries to update the same key
      currentUser = regularUser;

      const teamRes = await request(app)
        .patch(`/api/teams/${teamId}/api-keys/key-1/rate-limit`)
        .send({ rate_limit_rpm: 5000 });

      expect(teamRes.status).toBe(403);
      expect(teamRes.body.error).toBe('Rate limit locked by admin');
    });

    it('should allow team PATCH after admin unlocks a key', async () => {
      // Start locked
      insertApiKey('key-1', { rate_limit_admin_locked: 1, rate_limit_rpm: 1000 });

      // Admin unlocks
      const unlockRes = await request(app)
        .patch('/api/admin/api-keys/key-1/rate-limit')
        .send({ admin_locked: false });

      expect(unlockRes.status).toBe(200);
      expect(unlockRes.body.rate_limit_admin_locked).toBe(0);

      // Team lead can now update
      currentUser = regularUser;

      const teamRes = await request(app)
        .patch(`/api/teams/${teamId}/api-keys/key-1/rate-limit`)
        .send({ rate_limit_rpm: 5000 });

      expect(teamRes.status).toBe(200);
      expect(teamRes.body.rate_limit_rpm).toBe(5000);
    });
  });
});
