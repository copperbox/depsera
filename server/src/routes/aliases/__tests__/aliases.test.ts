import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

// Create in-memory database for testing
const testDb = new Database(':memory:');

// Mock the db module to return our test database
jest.mock('../../../db', () => ({
  __esModule: true,
  default: testDb,
  db: testDb,
}));

// Test user — admin (passes all authorization checks)
const adminUser = {
  id: 'admin-user-id',
  email: 'admin@test.com',
  name: 'Admin User',
  oidc_subject: null as string | null,
  password_hash: null as string | null,
  role: 'admin' as const,
  is_active: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Mock auth — admin passes through by default
jest.mock('../../../auth', () => ({
  requireAuth: jest.fn((req: { user: typeof adminUser }, _res: unknown, next: () => void) => {
    req.user = adminUser;
    next();
  }),
}));

// Reset singleton so it picks up our test db
import { StoreRegistry } from '../../../stores';
StoreRegistry.resetInstance();

import aliasesRouter from '../index';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = adminUser;
  next();
});
app.use('/api/aliases', aliasesRouter);

describe('Aliases API', () => {
  beforeAll(() => {
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
      INSERT INTO teams (id, name) VALUES ('team-1', 'Platform');
      INSERT INTO services (id, name, team_id, health_endpoint) VALUES ('svc-1', 'API Gateway', 'team-1', 'http://localhost/health');
      INSERT INTO dependencies (id, service_id, name) VALUES ('dep-1', 'svc-1', 'pg-main');
    `);
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM dependency_aliases');
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/aliases', () => {
    it('returns empty array when no aliases', async () => {
      const res = await request(app).get('/api/aliases');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all aliases', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('1', 'pg-main', 'Primary DB')"
      ).run();

      const res = await request(app).get('/api/aliases');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].alias).toBe('pg-main');
      expect(res.body[0].canonical_name).toBe('Primary DB');
    });
  });

  describe('POST /api/aliases', () => {
    it('creates an alias', async () => {
      const res = await request(app)
        .post('/api/aliases')
        .send({ alias: 'pg-main', canonical_name: 'Primary DB' });

      expect(res.status).toBe(201);
      expect(res.body.alias).toBe('pg-main');
      expect(res.body.canonical_name).toBe('Primary DB');
      expect(res.body.id).toBeDefined();
    });

    it('returns 400 when alias is missing', async () => {
      const res = await request(app)
        .post('/api/aliases')
        .send({ canonical_name: 'Primary DB' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when canonical_name is missing', async () => {
      const res = await request(app)
        .post('/api/aliases')
        .send({ alias: 'pg-main' });

      expect(res.status).toBe(400);
    });

    it('returns 409 when alias already exists', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('1', 'pg-main', 'Primary DB')"
      ).run();

      const res = await request(app)
        .post('/api/aliases')
        .send({ alias: 'pg-main', canonical_name: 'Other DB' });

      expect(res.status).toBe(409);
    });

    it('trims whitespace from inputs', async () => {
      const res = await request(app)
        .post('/api/aliases')
        .send({ alias: '  pg-main  ', canonical_name: '  Primary DB  ' });

      expect(res.status).toBe(201);
      expect(res.body.alias).toBe('pg-main');
      expect(res.body.canonical_name).toBe('Primary DB');
    });
  });

  describe('PUT /api/aliases/:id', () => {
    it('updates canonical name', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('1', 'pg-main', 'Primary DB')"
      ).run();

      const res = await request(app)
        .put('/api/aliases/1')
        .send({ canonical_name: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body.canonical_name).toBe('New Name');
    });

    it('returns 404 for nonexistent alias', async () => {
      const res = await request(app)
        .put('/api/aliases/nonexistent')
        .send({ canonical_name: 'New Name' });

      expect(res.status).toBe(404);
    });

    it('returns 400 when canonical_name is missing', async () => {
      const res = await request(app)
        .put('/api/aliases/1')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/aliases/:id', () => {
    it('deletes an alias', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('1', 'pg-main', 'Primary DB')"
      ).run();

      const res = await request(app).delete('/api/aliases/1');
      expect(res.status).toBe(204);

      const check = testDb.prepare('SELECT * FROM dependency_aliases WHERE id = ?').get('1');
      expect(check).toBeUndefined();
    });

    it('returns 404 for nonexistent alias', async () => {
      const res = await request(app).delete('/api/aliases/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/aliases/canonical-names', () => {
    it('returns distinct canonical names', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('1', 'pg-main', 'Primary DB')"
      ).run();
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('2', 'postgres', 'Primary DB')"
      ).run();
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('3', 'redis-1', 'Cache')"
      ).run();

      const res = await request(app).get('/api/aliases/canonical-names');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(['Cache', 'Primary DB']);
    });
  });
});
