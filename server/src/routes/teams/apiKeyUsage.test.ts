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

const leadUser: TestUser = {
  id: 'lead-1',
  email: 'lead@test.com',
  name: 'Lead User',
  role: 'user',
};

const memberUser: TestUser = {
  id: 'member-1',
  email: 'member@test.com',
  name: 'Member User',
  role: 'user',
};

let currentUser: TestUser = adminUser;

jest.mock('../../auth', () => ({
  requireAuth: jest.fn((req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.user = currentUser;
    req.session = { userId: currentUser.id };
    next();
  }),
  requireAdmin: jest.fn((req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.user = currentUser;
    req.session = { userId: currentUser.id };
    next();
  }),
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

import teamRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/teams', teamRouter);

describe('Team API Key Usage Routes', () => {
  const teamId = 'team-1';
  const otherTeamId = 'team-2';

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
    insertUser.run(leadUser.id, leadUser.email, leadUser.name, leadUser.role);
    insertUser.run(memberUser.id, memberUser.email, memberUser.name, memberUser.role);

    testDb.prepare('INSERT INTO teams (id, name, key) VALUES (?, ?, ?)').run(teamId, 'Test Team', 'TEST');
    testDb.prepare('INSERT INTO teams (id, name, key) VALUES (?, ?, ?)').run(otherTeamId, 'Other Team', 'OTHER');

    testDb.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(teamId, leadUser.id, 'lead');
    testDb.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(teamId, memberUser.id, 'member');
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    currentUser = adminUser;
    testDb.exec('DELETE FROM team_api_keys');
    testDb.exec('DELETE FROM api_key_usage_buckets');
  });

  function insertApiKey(id: string, teamId: string) {
    testDb.prepare(
      'INSERT INTO team_api_keys (id, team_id, name, key_hash, key_prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(id, teamId, `Key ${id}`, `hash-${id}`, 'dps_test', '2026-01-01T00:00:00Z');
  }

  function insertUsageBucket(
    apiKeyId: string,
    bucketStart: string,
    granularity: 'minute' | 'hour',
    pushCount: number,
    rejectedCount: number = 0,
  ) {
    testDb.prepare(
      'INSERT INTO api_key_usage_buckets (api_key_id, bucket_start, granularity, push_count, rejected_count) VALUES (?, ?, ?, ?, ?)',
    ).run(apiKeyId, bucketStart, granularity, pushCount, rejectedCount);
  }

  describe('GET /api/teams/:id/api-keys/:keyId/usage', () => {
    it('should return usage buckets for a valid key and time range', async () => {
      insertApiKey('key-1', teamId);
      const now = new Date();
      const bucketStart = new Date(now.getTime() - 60 * 60 * 1000).toISOString().slice(0, 16) + ':00';
      insertUsageBucket('key-1', bucketStart, 'minute', 100, 5);

      const from = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
      const to = now.toISOString();

      const res = await request(app)
        .get(`/api/teams/${teamId}/api-keys/key-1/usage`)
        .query({ granularity: 'minute', from, to });

      expect(res.status).toBe(200);
      expect(res.body.api_key_id).toBe('key-1');
      expect(res.body.granularity).toBe('minute');
      expect(res.body.buckets).toHaveLength(1);
      expect(res.body.buckets[0].push_count).toBe(100);
      expect(res.body.buckets[0].rejected_count).toBe(5);
    });

    it('should return empty buckets when no usage data exists', async () => {
      insertApiKey('key-1', teamId);

      const res = await request(app)
        .get(`/api/teams/${teamId}/api-keys/key-1/usage`)
        .query({ granularity: 'minute' });

      expect(res.status).toBe(200);
      expect(res.body.buckets).toEqual([]);
    });

    it('should return only minute-granularity rows when granularity=minute', async () => {
      insertApiKey('key-1', teamId);
      const now = new Date();
      const minuteBucket = new Date(now.getTime() - 30 * 60 * 1000).toISOString().slice(0, 16) + ':00';
      const hourBucket = new Date(now.getTime() - 30 * 60 * 1000).toISOString().slice(0, 13) + ':00:00';

      insertUsageBucket('key-1', minuteBucket, 'minute', 50);
      insertUsageBucket('key-1', hourBucket, 'hour', 200);

      const from = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
      const to = now.toISOString();

      const res = await request(app)
        .get(`/api/teams/${teamId}/api-keys/key-1/usage`)
        .query({ granularity: 'minute', from, to });

      expect(res.status).toBe(200);
      expect(res.body.buckets).toHaveLength(1);
      expect(res.body.buckets[0].push_count).toBe(50);
    });

    it('should return only hour-granularity rows when granularity=hour', async () => {
      insertApiKey('key-1', teamId);
      const now = new Date();
      const minuteBucket = new Date(now.getTime() - 30 * 60 * 1000).toISOString().slice(0, 16) + ':00';
      const hourBucket = new Date(now.getTime() - 30 * 60 * 1000).toISOString().slice(0, 13) + ':00:00';

      insertUsageBucket('key-1', minuteBucket, 'minute', 50);
      insertUsageBucket('key-1', hourBucket, 'hour', 200);

      const from = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
      const to = now.toISOString();

      const res = await request(app)
        .get(`/api/teams/${teamId}/api-keys/key-1/usage`)
        .query({ granularity: 'hour', from, to });

      expect(res.status).toBe(200);
      expect(res.body.buckets).toHaveLength(1);
      expect(res.body.buckets[0].push_count).toBe(200);
    });

    it('should return 403 when key belongs to a different team', async () => {
      insertApiKey('key-other', otherTeamId);

      const res = await request(app)
        .get(`/api/teams/${teamId}/api-keys/key-other/usage`)
        .query({ granularity: 'minute' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('does not belong to this team');
    });

    it('should deny regular member from accessing usage', async () => {
      currentUser = memberUser;
      insertApiKey('key-1', teamId);

      const res = await request(app)
        .get(`/api/teams/${teamId}/api-keys/key-1/usage`)
        .query({ granularity: 'minute' });

      expect(res.status).toBe(403);
    });

    it('should allow team lead to access usage', async () => {
      currentUser = leadUser;
      insertApiKey('key-1', teamId);

      const res = await request(app)
        .get(`/api/teams/${teamId}/api-keys/key-1/usage`)
        .query({ granularity: 'minute' });

      expect(res.status).toBe(200);
      expect(res.body.api_key_id).toBe('key-1');
    });

    it('should use default time range when from/to are omitted', async () => {
      insertApiKey('key-1', teamId);

      const res = await request(app)
        .get(`/api/teams/${teamId}/api-keys/key-1/usage`)
        .query({ granularity: 'minute' });

      expect(res.status).toBe(200);
      expect(res.body.from).toBeDefined();
      expect(res.body.to).toBeDefined();
      expect(res.body.granularity).toBe('minute');
    });
  });
});
