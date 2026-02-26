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

import dependenciesRouter from '../index';
import { auditFromRequest } from '../../../services/audit/AuditLogService';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = currentUser;
  next();
});
app.use('/api/dependencies', dependenciesRouter);

describe('Dependency Overrides API', () => {
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
        last_checked TEXT,
        last_status_change TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(service_id, name),
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
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
      INSERT INTO dependencies (id, service_id, name, canonical_name, impact) VALUES ('dep-2', 'svc-1', 'redis-cache', 'Redis', 'Medium');
    `);
  });

  beforeEach(() => {
    // Reset overrides on both dependencies
    testDb.prepare('UPDATE dependencies SET contact_override = NULL, impact_override = NULL').run();
    currentUser = defaultAdminUser;
    jest.clearAllMocks();
  });

  afterAll(() => {
    testDb.close();
  });

  // ---------- PUT /:id/overrides ----------

  describe('PUT /api/dependencies/:id/overrides', () => {
    it('sets contact and impact overrides', async () => {
      const res = await request(app)
        .put('/api/dependencies/dep-1/overrides')
        .send({ contact_override: { email: 'db@example.com' }, impact_override: 'Critical' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('dep-1');
      expect(res.body.contact_override).toBe('{"email":"db@example.com"}');
      expect(res.body.impact_override).toBe('Critical');
    });

    it('sets only contact_override', async () => {
      const res = await request(app)
        .put('/api/dependencies/dep-1/overrides')
        .send({ contact_override: { slack: '#db-support' } });

      expect(res.status).toBe(200);
      expect(res.body.contact_override).toBe('{"slack":"#db-support"}');
      expect(res.body.impact_override).toBeNull();
    });

    it('sets only impact_override', async () => {
      const res = await request(app)
        .put('/api/dependencies/dep-1/overrides')
        .send({ impact_override: 'High' });

      expect(res.status).toBe(200);
      expect(res.body.impact_override).toBe('High');
      expect(res.body.contact_override).toBeNull();
    });

    it('clears an override when set to null', async () => {
      // Set overrides first
      testDb.prepare(
        "UPDATE dependencies SET contact_override = '{\"team\":\"db\"}', impact_override = 'Critical' WHERE id = 'dep-1'"
      ).run();

      const res = await request(app)
        .put('/api/dependencies/dep-1/overrides')
        .send({ contact_override: null, impact_override: null });

      expect(res.status).toBe(200);
      expect(res.body.contact_override).toBeNull();
      expect(res.body.impact_override).toBeNull();
    });

    it('does not modify polled data columns', async () => {
      testDb.prepare(
        "UPDATE dependencies SET impact = 'Medium', contact = '{\"team\":\"original\"}' WHERE id = 'dep-1'"
      ).run();

      await request(app)
        .put('/api/dependencies/dep-1/overrides')
        .send({ impact_override: 'High' });

      const row = testDb.prepare('SELECT impact, contact FROM dependencies WHERE id = ?').get('dep-1') as { impact: string; contact: string };
      expect(row.impact).toBe('Medium');
      expect(row.contact).toBe('{"team":"original"}');
    });

    it('returns 400 when neither field is provided', async () => {
      const res = await request(app)
        .put('/api/dependencies/dep-1/overrides')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('At least one of');
    });

    it('returns 400 when contact_override is not an object', async () => {
      const res = await request(app)
        .put('/api/dependencies/dep-1/overrides')
        .send({ contact_override: 'not-an-object' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('contact_override must be an object');
    });

    it('returns 400 when contact_override is an array', async () => {
      const res = await request(app)
        .put('/api/dependencies/dep-1/overrides')
        .send({ contact_override: ['not', 'valid'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('contact_override must be an object');
    });

    it('returns 400 when impact_override is not a string', async () => {
      const res = await request(app)
        .put('/api/dependencies/dep-1/overrides')
        .send({ impact_override: 123 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('impact_override must be a string');
    });

    it('returns 404 for nonexistent dependency', async () => {
      const res = await request(app)
        .put('/api/dependencies/nonexistent/overrides')
        .send({ impact_override: 'Critical' });

      expect(res.status).toBe(404);
    });

    it('logs an audit event on success', async () => {
      await request(app)
        .put('/api/dependencies/dep-1/overrides')
        .send({ impact_override: 'Critical' });

      expect(auditFromRequest).toHaveBeenCalledWith(
        expect.anything(),
        'dependency_override.updated',
        'dependency',
        'dep-1',
        expect.objectContaining({ impact_override: 'Critical' }),
      );
    });

    // --- Permission tests ---

    it('allows admin', async () => {
      const res = await request(app)
        .put('/api/dependencies/dep-1/overrides')
        .send({ impact_override: 'Critical' });

      expect(res.status).toBe(200);
    });

    it('allows team lead of the owning team', async () => {
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
        .put('/api/dependencies/dep-1/overrides')
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
        .put('/api/dependencies/dep-1/overrides')
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
        .put('/api/dependencies/dep-1/overrides')
        .send({ impact_override: 'Critical' });

      expect(res.status).toBe(403);
    });
  });

  // ---------- DELETE /:id/overrides ----------

  describe('DELETE /api/dependencies/:id/overrides', () => {
    it('clears all overrides for a dependency', async () => {
      // Set overrides first
      testDb.prepare(
        "UPDATE dependencies SET contact_override = '{\"team\":\"db\"}', impact_override = 'Critical' WHERE id = 'dep-1'"
      ).run();

      const res = await request(app).delete('/api/dependencies/dep-1/overrides');
      expect(res.status).toBe(204);

      const row = testDb.prepare('SELECT contact_override, impact_override FROM dependencies WHERE id = ?').get('dep-1') as { contact_override: string | null; impact_override: string | null };
      expect(row.contact_override).toBeNull();
      expect(row.impact_override).toBeNull();
    });

    it('returns 204 even when no overrides were set', async () => {
      const res = await request(app).delete('/api/dependencies/dep-1/overrides');
      expect(res.status).toBe(204);
    });

    it('returns 404 for nonexistent dependency', async () => {
      const res = await request(app).delete('/api/dependencies/nonexistent/overrides');
      expect(res.status).toBe(404);
    });

    it('logs an audit event on success', async () => {
      await request(app).delete('/api/dependencies/dep-1/overrides');

      expect(auditFromRequest).toHaveBeenCalledWith(
        expect.anything(),
        'dependency_override.cleared',
        'dependency',
        'dep-1',
      );
    });

    it('does not modify polled data columns', async () => {
      testDb.prepare(
        "UPDATE dependencies SET impact = 'Medium', contact = '{\"team\":\"original\"}', contact_override = '{\"team\":\"override\"}', impact_override = 'High' WHERE id = 'dep-1'"
      ).run();

      await request(app).delete('/api/dependencies/dep-1/overrides');

      const row = testDb.prepare('SELECT impact, contact FROM dependencies WHERE id = ?').get('dep-1') as { impact: string; contact: string };
      expect(row.impact).toBe('Medium');
      expect(row.contact).toBe('{"team":"original"}');
    });

    // --- Permission tests ---

    it('allows admin', async () => {
      const res = await request(app).delete('/api/dependencies/dep-1/overrides');
      expect(res.status).toBe(204);
    });

    it('allows team lead of the owning team', async () => {
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

      const res = await request(app).delete('/api/dependencies/dep-1/overrides');
      expect(res.status).toBe(204);
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

      const res = await request(app).delete('/api/dependencies/dep-1/overrides');
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

      const res = await request(app).delete('/api/dependencies/dep-1/overrides');
      expect(res.status).toBe(403);
    });
  });
});
