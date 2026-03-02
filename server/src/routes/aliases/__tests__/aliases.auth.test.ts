import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../../../db', () => ({
  __esModule: true,
  default: testDb,
  db: testDb,
}));

// Test user type
interface TestUser {
  id: string;
  email: string;
  name: string;
  oidc_subject: string | null;
  password_hash: string | null;
  role: 'admin' | 'user';
  is_active: number;
  created_at: string;
  updated_at: string;
}

const adminUser: TestUser = {
  id: 'admin-user-id',
  email: 'admin@test.com',
  name: 'Admin User',
  oidc_subject: null,
  password_hash: null,
  role: 'admin',
  is_active: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const leadUser: TestUser = {
  id: 'lead-user-id',
  email: 'lead@test.com',
  name: 'Team Lead',
  oidc_subject: null,
  password_hash: null,
  role: 'user',
  is_active: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const memberUser: TestUser = {
  id: 'member-user-id',
  email: 'member@test.com',
  name: 'Team Member',
  oidc_subject: null,
  password_hash: null,
  role: 'user',
  is_active: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const outsiderUser: TestUser = {
  id: 'outsider-user-id',
  email: 'outsider@test.com',
  name: 'Outsider',
  oidc_subject: null,
  password_hash: null,
  role: 'user',
  is_active: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

let currentUser: TestUser = adminUser;

// Mock auth — sets req.user from currentUser
jest.mock('../../../auth', () => ({
  requireAuth: jest.fn((req: { user: TestUser }, _res: unknown, next: () => void) => {
    req.user = currentUser;
    next();
  }),
}));

import { StoreRegistry } from '../../../stores';
StoreRegistry.resetInstance();

import aliasesRouter from '../index';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = currentUser;
  next();
});
app.use('/api/aliases', aliasesRouter);

describe('Aliases API — authorization', () => {
  beforeAll(() => {
    testDb.pragma('foreign_keys = ON');
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        oidc_subject TEXT UNIQUE,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        contact TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS team_members (
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (team_id, user_id),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        health_endpoint TEXT NOT NULL,
        metrics_endpoint TEXT,
        schema_config TEXT,
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_poll_success INTEGER,
        last_poll_error TEXT,
        poll_warnings TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id)
      );

      CREATE TABLE IF NOT EXISTS dependencies (
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
        UNIQUE(service_id, name),
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS dependency_aliases (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        canonical_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      -- Seed data
      INSERT INTO users (id, email, name, role) VALUES ('admin-user-id', 'admin@test.com', 'Admin User', 'admin');
      INSERT INTO users (id, email, name, role) VALUES ('lead-user-id', 'lead@test.com', 'Team Lead', 'user');
      INSERT INTO users (id, email, name, role) VALUES ('member-user-id', 'member@test.com', 'Team Member', 'user');
      INSERT INTO users (id, email, name, role) VALUES ('outsider-user-id', 'outsider@test.com', 'Outsider', 'user');

      INSERT INTO teams (id, name) VALUES ('team-1', 'Platform');
      INSERT INTO team_members (team_id, user_id, role) VALUES ('team-1', 'lead-user-id', 'lead');
      INSERT INTO team_members (team_id, user_id, role) VALUES ('team-1', 'member-user-id', 'member');

      INSERT INTO services (id, name, team_id, health_endpoint) VALUES ('svc-1', 'API Gateway', 'team-1', 'http://localhost/health');
      INSERT INTO dependencies (id, service_id, name) VALUES ('dep-1', 'svc-1', 'pg-main');
      INSERT INTO dependencies (id, service_id, name) VALUES ('dep-2', 'svc-1', 'redis-cache');
    `);
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM dependency_aliases');
    currentUser = adminUser;
  });

  afterAll(() => {
    testDb.close();
  });

  describe('read endpoints remain accessible to all authenticated users', () => {
    it('GET /api/aliases returns 200 for regular member', async () => {
      currentUser = memberUser;
      const res = await request(app).get('/api/aliases');
      expect(res.status).toBe(200);
    });

    it('GET /api/aliases/canonical-names returns 200 for regular member', async () => {
      currentUser = memberUser;
      const res = await request(app).get('/api/aliases/canonical-names');
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/aliases — team lead access', () => {
    it('allows admin to create alias', async () => {
      const res = await request(app)
        .post('/api/aliases')
        .send({ alias: 'pg-main', canonical_name: 'Primary DB' });

      expect(res.status).toBe(201);
    });

    it('allows team lead to create alias for dependency on their team service', async () => {
      currentUser = leadUser;
      const res = await request(app)
        .post('/api/aliases')
        .send({ alias: 'pg-main', canonical_name: 'Primary DB' });

      expect(res.status).toBe(201);
    });

    it('denies team member (non-lead) from creating alias', async () => {
      currentUser = memberUser;
      const res = await request(app)
        .post('/api/aliases')
        .send({ alias: 'pg-main', canonical_name: 'Primary DB' });

      expect(res.status).toBe(403);
    });

    it('denies outsider with no team membership', async () => {
      currentUser = outsiderUser;
      const res = await request(app)
        .post('/api/aliases')
        .send({ alias: 'pg-main', canonical_name: 'Primary DB' });

      expect(res.status).toBe(403);
    });

    it('denies lead for alias name not matching any dependency on their services', async () => {
      currentUser = leadUser;
      const res = await request(app)
        .post('/api/aliases')
        .send({ alias: 'unknown-dep', canonical_name: 'Something' });

      expect(res.status).toBe(403);
    });

    it('does not create data when unauthorized', async () => {
      currentUser = memberUser;
      await request(app)
        .post('/api/aliases')
        .send({ alias: 'pg-main', canonical_name: 'Primary DB' });

      const count = testDb.prepare('SELECT COUNT(*) as count FROM dependency_aliases').get() as { count: number };
      expect(count.count).toBe(0);
    });
  });

  describe('PUT /api/aliases/:id — team lead access', () => {
    it('allows team lead to update alias for dependency on their team service', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('a1', 'pg-main', 'Primary DB')"
      ).run();

      currentUser = leadUser;
      const res = await request(app)
        .put('/api/aliases/a1')
        .send({ canonical_name: 'Updated DB' });

      expect(res.status).toBe(200);
      expect(res.body.canonical_name).toBe('Updated DB');
    });

    it('denies team member from updating alias', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('a1', 'pg-main', 'Primary DB')"
      ).run();

      currentUser = memberUser;
      const res = await request(app)
        .put('/api/aliases/a1')
        .send({ canonical_name: 'Updated DB' });

      expect(res.status).toBe(403);
    });

    it('denies outsider from updating alias', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('a1', 'pg-main', 'Primary DB')"
      ).run();

      currentUser = outsiderUser;
      const res = await request(app)
        .put('/api/aliases/a1')
        .send({ canonical_name: 'Updated DB' });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/aliases/:id — team lead access', () => {
    it('allows team lead to delete alias for dependency on their team service', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('a1', 'pg-main', 'Primary DB')"
      ).run();

      currentUser = leadUser;
      const res = await request(app).delete('/api/aliases/a1');
      expect(res.status).toBe(204);
    });

    it('denies team member from deleting alias', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('a1', 'pg-main', 'Primary DB')"
      ).run();

      currentUser = memberUser;
      const res = await request(app).delete('/api/aliases/a1');
      expect(res.status).toBe(403);
    });

    it('denies outsider from deleting alias', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('a1', 'pg-main', 'Primary DB')"
      ).run();

      currentUser = outsiderUser;
      const res = await request(app).delete('/api/aliases/a1');
      expect(res.status).toBe(403);
    });
  });
});
