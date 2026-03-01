import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

// Create in-memory database for testing
const testDb = new Database(':memory:');

// Mock the db module with both named and default exports
jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

// Default admin user for tests
const defaultAdminUser = {
  id: 'test-admin-user-id',
  email: 'admin@test.com',
  name: 'Test Admin',
  oidc_subject: null,
  role: 'admin' as const,
  is_active: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Mock the auth module to avoid session store initialization
jest.mock('../../auth', () => ({
  requireAuth: jest.fn((req, _res, next) => {
    req.user = defaultAdminUser;
    next();
  }),
  requireAdmin: jest.fn((_req, _res, next) => next()),
  requireTeamAccess: jest.fn((_req, _res, next) => next()),
  requireTeamLead: jest.fn((_req, _res, next) => next()),
  requireServiceTeamAccess: jest.fn((_req, _res, next) => next()),
  requireServiceTeamLead: jest.fn((_req, _res, next) => next()),
  requireBodyTeamLead: jest.fn((_req, _res, next) => next()),
}));

import servicesRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/services', servicesRouter);

describe('GET /api/services/catalog', () => {
  let teamAId: string;
  let teamBId: string;

  beforeAll(() => {
    testDb.pragma('foreign_keys = ON');

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        key TEXT,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS services (
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
        manifest_managed INTEGER DEFAULT 0,
        manifest_last_synced_values TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS dependencies (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        impact TEXT,
        healthy INTEGER,
        health_state INTEGER,
        health_code INTEGER,
        latency_ms INTEGER,
        last_checked TEXT,
        last_status_change TEXT,
        skipped INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        UNIQUE (service_id, name)
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS dependency_associations (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        linked_service_id TEXT NOT NULL,
        association_type TEXT NOT NULL DEFAULT 'api_call',
        manifest_managed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE,
        FOREIGN KEY (linked_service_id) REFERENCES services(id) ON DELETE CASCADE,
        UNIQUE (dependency_id, linked_service_id)
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS dependency_canonical_overrides (
        id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL,
        team_id TEXT,
        manifest_managed INTEGER DEFAULT 0,
        contact_override TEXT,
        impact_override TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by TEXT
      )
    `);

    // Create two teams
    teamAId = randomUUID();
    teamBId = randomUUID();
    testDb.prepare('INSERT INTO teams (id, name, key, description) VALUES (?, ?, ?, ?)').run(teamAId, 'Team Alpha', 'team-alpha', 'First team');
    testDb.prepare('INSERT INTO teams (id, name, key, description) VALUES (?, ?, ?, ?)').run(teamBId, 'Team Beta', 'team-beta', 'Second team');
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM dependency_associations');
    testDb.exec('DELETE FROM dependencies');
    testDb.exec('DELETE FROM services');
  });

  afterAll(() => {
    testDb.close();
  });

  function insertService(overrides: Record<string, unknown> = {}) {
    const id = overrides.id as string ?? randomUUID();
    const defaults = {
      name: 'Test Service',
      team_id: teamAId,
      health_endpoint: 'https://example.com/health',
      is_active: 1,
      is_external: 0,
      description: null,
      manifest_key: null,
    };
    const data = { ...defaults, ...overrides, id };
    testDb.prepare(`
      INSERT INTO services (id, name, team_id, health_endpoint, is_active, is_external, description, manifest_key)
      VALUES (@id, @name, @team_id, @health_endpoint, @is_active, @is_external, @description, @manifest_key)
    `).run(data);
    return id;
  }

  it('should return all internal services across teams', async () => {
    insertService({ name: 'Alpha Svc', team_id: teamAId, manifest_key: 'alpha-svc' });
    insertService({ name: 'Beta Svc', team_id: teamBId, manifest_key: 'beta-svc' });

    const res = await request(app).get('/api/services/catalog');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const names = res.body.map((e: { name: string }) => e.name).sort();
    expect(names).toEqual(['Alpha Svc', 'Beta Svc']);
  });

  it('should return only minimal catalog fields', async () => {
    insertService({
      name: 'Svc',
      team_id: teamAId,
      manifest_key: 'my-key',
      description: 'A service',
    });

    const res = await request(app).get('/api/services/catalog');

    expect(res.status).toBe(200);
    const entry = res.body[0];
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('name', 'Svc');
    expect(entry).toHaveProperty('manifest_key', 'my-key');
    expect(entry).toHaveProperty('description', 'A service');
    expect(entry).toHaveProperty('is_active', 1);
    expect(entry).toHaveProperty('team_id', teamAId);
    expect(entry).toHaveProperty('team_name', 'Team Alpha');
    expect(entry).toHaveProperty('team_key', 'team-alpha');

    // Ensure sensitive fields are NOT present
    expect(entry).not.toHaveProperty('health_endpoint');
    expect(entry).not.toHaveProperty('metrics_endpoint');
    expect(entry).not.toHaveProperty('schema_config');
    expect(entry).not.toHaveProperty('last_poll_error');
    expect(entry).not.toHaveProperty('poll_warnings');
    expect(entry).not.toHaveProperty('manifest_last_synced_values');
  });

  it('should exclude external services', async () => {
    insertService({ name: 'Internal', is_external: 0 });
    insertService({ name: 'External', is_external: 1 });

    const res = await request(app).get('/api/services/catalog');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Internal');
  });

  it('should filter by search on name (case-insensitive)', async () => {
    insertService({ name: 'Auth Service', manifest_key: 'auth-svc' });
    insertService({ name: 'Payment Service', manifest_key: 'pay-svc' });

    const res = await request(app).get('/api/services/catalog?search=auth');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Auth Service');
  });

  it('should filter by search on manifest_key (case-insensitive)', async () => {
    insertService({ name: 'Auth Service', manifest_key: 'auth-svc' });
    insertService({ name: 'Payment Service', manifest_key: 'pay-svc' });

    const res = await request(app).get('/api/services/catalog?search=PAY');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].manifest_key).toBe('pay-svc');
  });

  it('should filter by team_id', async () => {
    insertService({ name: 'Alpha Svc', team_id: teamAId });
    insertService({ name: 'Beta Svc', team_id: teamBId });

    const res = await request(app).get(`/api/services/catalog?team_id=${teamBId}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Beta Svc');
  });

  it('should combine search and team_id filters', async () => {
    insertService({ name: 'Auth', team_id: teamAId, manifest_key: 'auth' });
    insertService({ name: 'Auth', team_id: teamBId, manifest_key: 'auth-beta' });
    insertService({ name: 'Other', team_id: teamBId, manifest_key: 'other' });

    const res = await request(app).get(`/api/services/catalog?search=auth&team_id=${teamBId}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].team_id).toBe(teamBId);
  });

  it('should return empty array when no services match', async () => {
    const res = await request(app).get('/api/services/catalog?search=nonexistent');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should return services with null manifest_key', async () => {
    insertService({ name: 'No Key Service', manifest_key: null });

    const res = await request(app).get('/api/services/catalog');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].manifest_key).toBeNull();
  });

  it('should not match null manifest_key when searching', async () => {
    insertService({ name: 'Other', manifest_key: null });
    insertService({ name: 'Auth', manifest_key: 'auth-svc' });

    const res = await request(app).get('/api/services/catalog?search=auth');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Auth');
  });
});
