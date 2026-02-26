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

// Default user for tests — admin
const defaultAdminUser: TestUser = {
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

let currentUser: TestUser = defaultAdminUser;

// Mock auth — sets req.user from currentUser
jest.mock('../../../auth', () => ({
  requireAuth: jest.fn((req: { user: TestUser }, _res: unknown, next: () => void) => {
    req.user = currentUser;
    next();
  }),
  requireAdmin: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

// Mock audit logging
jest.mock('../../../services/audit/AuditLogService', () => ({
  auditFromRequest: jest.fn(),
}));

// Reset singleton so it picks up our test db
import { StoreRegistry } from '../../../stores';
StoreRegistry.resetInstance();

import canonicalOverridesRouter from '../index';
import { auditFromRequest } from '../../../services/audit/AuditLogService';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = currentUser;
  next();
});
app.use('/api/canonical-overrides', canonicalOverridesRouter);

describe('Canonical Overrides API', () => {
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

      CREATE TABLE IF NOT EXISTS dependency_canonical_overrides (
        id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL UNIQUE,
        contact_override TEXT,
        impact_override TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by TEXT,
        FOREIGN KEY (updated_by) REFERENCES users(id)
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
      INSERT INTO dependencies (id, service_id, name, canonical_name) VALUES ('dep-1', 'svc-1', 'postgres-main', 'PostgreSQL');
      INSERT INTO dependencies (id, service_id, name, canonical_name) VALUES ('dep-2', 'svc-1', 'redis-cache', 'Redis');
    `);
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM dependency_canonical_overrides');
    currentUser = defaultAdminUser;
    jest.clearAllMocks();
  });

  afterAll(() => {
    testDb.close();
  });

  // ---------- GET / ----------

  describe('GET /api/canonical-overrides', () => {
    it('returns empty array when no overrides exist', async () => {
      const res = await request(app).get('/api/canonical-overrides');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all overrides', async () => {
      testDb.prepare(
        `INSERT INTO dependency_canonical_overrides (id, canonical_name, contact_override, impact_override, updated_by)
         VALUES ('o1', 'PostgreSQL', '{"team":"db"}', 'Critical', 'admin-user-id')`
      ).run();
      testDb.prepare(
        `INSERT INTO dependency_canonical_overrides (id, canonical_name, impact_override, updated_by)
         VALUES ('o2', 'Redis', 'Medium', 'admin-user-id')`
      ).run();

      const res = await request(app).get('/api/canonical-overrides');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].canonical_name).toBe('PostgreSQL');
      expect(res.body[1].canonical_name).toBe('Redis');
    });
  });

  // ---------- GET /:canonicalName ----------

  describe('GET /api/canonical-overrides/:canonicalName', () => {
    it('returns a single override', async () => {
      testDb.prepare(
        `INSERT INTO dependency_canonical_overrides (id, canonical_name, contact_override, impact_override, updated_by)
         VALUES ('o1', 'PostgreSQL', '{"team":"db"}', 'Critical', 'admin-user-id')`
      ).run();

      const res = await request(app).get('/api/canonical-overrides/PostgreSQL');
      expect(res.status).toBe(200);
      expect(res.body.canonical_name).toBe('PostgreSQL');
      expect(res.body.contact_override).toBe('{"team":"db"}');
      expect(res.body.impact_override).toBe('Critical');
    });

    it('returns 404 for nonexistent override', async () => {
      const res = await request(app).get('/api/canonical-overrides/NonExistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Canonical override not found');
    });
  });

  // ---------- PUT /:canonicalName ----------

  describe('PUT /api/canonical-overrides/:canonicalName', () => {
    it('creates a new canonical override', async () => {
      const res = await request(app)
        .put('/api/canonical-overrides/PostgreSQL')
        .send({ contact_override: { team: 'db-team' }, impact_override: 'Critical' });

      expect(res.status).toBe(200);
      expect(res.body.canonical_name).toBe('PostgreSQL');
      expect(res.body.contact_override).toBe('{"team":"db-team"}');
      expect(res.body.impact_override).toBe('Critical');
      expect(res.body.updated_by).toBe('admin-user-id');
    });

    it('updates an existing canonical override', async () => {
      testDb.prepare(
        `INSERT INTO dependency_canonical_overrides (id, canonical_name, impact_override, updated_by)
         VALUES ('o1', 'PostgreSQL', 'Low', 'admin-user-id')`
      ).run();

      const res = await request(app)
        .put('/api/canonical-overrides/PostgreSQL')
        .send({ impact_override: 'Critical' });

      expect(res.status).toBe(200);
      expect(res.body.impact_override).toBe('Critical');
    });

    it('clears an override field when set to null', async () => {
      testDb.prepare(
        `INSERT INTO dependency_canonical_overrides (id, canonical_name, contact_override, impact_override, updated_by)
         VALUES ('o1', 'PostgreSQL', '{"team":"db"}', 'Critical', 'admin-user-id')`
      ).run();

      const res = await request(app)
        .put('/api/canonical-overrides/PostgreSQL')
        .send({ contact_override: null, impact_override: null });

      expect(res.status).toBe(200);
      expect(res.body.contact_override).toBeNull();
      expect(res.body.impact_override).toBeNull();
    });

    it('accepts contact_override only', async () => {
      const res = await request(app)
        .put('/api/canonical-overrides/PostgreSQL')
        .send({ contact_override: { email: 'db@example.com' } });

      expect(res.status).toBe(200);
      expect(res.body.contact_override).toBe('{"email":"db@example.com"}');
    });

    it('accepts impact_override only', async () => {
      const res = await request(app)
        .put('/api/canonical-overrides/PostgreSQL')
        .send({ impact_override: 'High' });

      expect(res.status).toBe(200);
      expect(res.body.impact_override).toBe('High');
    });

    it('returns 400 when neither field is provided', async () => {
      const res = await request(app)
        .put('/api/canonical-overrides/PostgreSQL')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('At least one of');
    });

    it('returns 400 when contact_override is not an object', async () => {
      const res = await request(app)
        .put('/api/canonical-overrides/PostgreSQL')
        .send({ contact_override: 'not-an-object' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('contact_override must be an object');
    });

    it('returns 400 when contact_override is an array', async () => {
      const res = await request(app)
        .put('/api/canonical-overrides/PostgreSQL')
        .send({ contact_override: ['not', 'valid'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('contact_override must be an object');
    });

    it('returns 400 when impact_override is not a string', async () => {
      const res = await request(app)
        .put('/api/canonical-overrides/PostgreSQL')
        .send({ impact_override: 123 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('impact_override must be a string');
    });

    it('logs an audit event on success', async () => {
      await request(app)
        .put('/api/canonical-overrides/PostgreSQL')
        .send({ impact_override: 'Critical' });

      expect(auditFromRequest).toHaveBeenCalledWith(
        expect.anything(),
        'canonical_override.upserted',
        'canonical_override',
        'PostgreSQL',
        expect.objectContaining({ canonical_name: 'PostgreSQL', impact_override: 'Critical' }),
      );
    });

    // --- Permission tests ---

    it('allows team lead of a team with a service reporting this canonical dep', async () => {
      currentUser = {
        id: 'lead-user-id',
        email: 'lead@test.com',
        name: 'Team Lead',
        oidc_subject: null,
        password_hash: null,
        role: 'user' as const,
        is_active: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const res = await request(app)
        .put('/api/canonical-overrides/PostgreSQL')
        .send({ impact_override: 'Critical' });

      expect(res.status).toBe(200);
    });

    it('denies regular team member', async () => {
      currentUser = {
        id: 'member-user-id',
        email: 'member@test.com',
        name: 'Team Member',
        oidc_subject: null,
        password_hash: null,
        role: 'user' as const,
        is_active: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const res = await request(app)
        .put('/api/canonical-overrides/PostgreSQL')
        .send({ impact_override: 'Critical' });

      expect(res.status).toBe(403);
    });

    it('denies user with no team membership', async () => {
      currentUser = {
        id: 'outsider-user-id',
        email: 'outsider@test.com',
        name: 'Outsider',
        oidc_subject: null,
        password_hash: null,
        role: 'user' as const,
        is_active: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const res = await request(app)
        .put('/api/canonical-overrides/PostgreSQL')
        .send({ impact_override: 'Critical' });

      expect(res.status).toBe(403);
    });
  });

  // ---------- DELETE /:canonicalName ----------

  describe('DELETE /api/canonical-overrides/:canonicalName', () => {
    it('deletes an existing override', async () => {
      testDb.prepare(
        `INSERT INTO dependency_canonical_overrides (id, canonical_name, impact_override, updated_by)
         VALUES ('o1', 'PostgreSQL', 'Critical', 'admin-user-id')`
      ).run();

      const res = await request(app).delete('/api/canonical-overrides/PostgreSQL');
      expect(res.status).toBe(204);

      const check = testDb.prepare(
        'SELECT * FROM dependency_canonical_overrides WHERE canonical_name = ?'
      ).get('PostgreSQL');
      expect(check).toBeUndefined();
    });

    it('returns 404 for nonexistent override', async () => {
      const res = await request(app).delete('/api/canonical-overrides/NonExistent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Canonical override not found');
    });

    it('logs an audit event on success', async () => {
      testDb.prepare(
        `INSERT INTO dependency_canonical_overrides (id, canonical_name, impact_override, updated_by)
         VALUES ('o1', 'PostgreSQL', 'Critical', 'admin-user-id')`
      ).run();

      await request(app).delete('/api/canonical-overrides/PostgreSQL');

      expect(auditFromRequest).toHaveBeenCalledWith(
        expect.anything(),
        'canonical_override.deleted',
        'canonical_override',
        'PostgreSQL',
        expect.objectContaining({ canonical_name: 'PostgreSQL' }),
      );
    });

    it('denies regular team member', async () => {
      testDb.prepare(
        `INSERT INTO dependency_canonical_overrides (id, canonical_name, impact_override, updated_by)
         VALUES ('o1', 'PostgreSQL', 'Critical', 'admin-user-id')`
      ).run();

      currentUser = {
        id: 'member-user-id',
        email: 'member@test.com',
        name: 'Team Member',
        oidc_subject: null,
        password_hash: null,
        role: 'user' as const,
        is_active: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const res = await request(app).delete('/api/canonical-overrides/PostgreSQL');
      expect(res.status).toBe(403);
    });

    it('allows team lead of relevant team', async () => {
      testDb.prepare(
        `INSERT INTO dependency_canonical_overrides (id, canonical_name, impact_override, updated_by)
         VALUES ('o1', 'PostgreSQL', 'Critical', 'admin-user-id')`
      ).run();

      currentUser = {
        id: 'lead-user-id',
        email: 'lead@test.com',
        name: 'Team Lead',
        oidc_subject: null,
        password_hash: null,
        role: 'user' as const,
        is_active: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const res = await request(app).delete('/api/canonical-overrides/PostgreSQL');
      expect(res.status).toBe(204);
    });
  });
});
