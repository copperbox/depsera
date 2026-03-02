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

import catalogRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/catalog', catalogRouter);

describe('GET /api/catalog/external-dependencies', () => {
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
        canonical_name TEXT,
        description TEXT,
        impact TEXT,
        type TEXT,
        healthy INTEGER,
        health_state TEXT,
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
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        UNIQUE (service_id, name)
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

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS dependency_aliases (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        canonical_name TEXT NOT NULL,
        manifest_team_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Create two teams
    teamAId = randomUUID();
    teamBId = randomUUID();
    testDb
      .prepare('INSERT INTO teams (id, name, key, description) VALUES (?, ?, ?, ?)')
      .run(teamAId, 'Team Alpha', 'team-alpha', 'First team');
    testDb
      .prepare('INSERT INTO teams (id, name, key, description) VALUES (?, ?, ?, ?)')
      .run(teamBId, 'Team Beta', 'team-beta', 'Second team');
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM dependency_aliases');
    testDb.exec('DELETE FROM dependency_canonical_overrides');
    testDb.exec('DELETE FROM dependencies');
    testDb.exec('DELETE FROM services');
  });

  afterAll(() => {
    testDb.close();
  });

  function insertService(overrides: Record<string, unknown> = {}) {
    const id = (overrides.id as string) ?? randomUUID();
    const defaults = {
      name: 'Test Service',
      team_id: teamAId,
      health_endpoint: 'https://example.com/health',
      is_active: 1,
      is_external: 0,
      manifest_key: null,
    };
    const data = { ...defaults, ...overrides, id };
    testDb
      .prepare(
        `INSERT INTO services (id, name, team_id, health_endpoint, is_active, is_external, manifest_key)
         VALUES (@id, @name, @team_id, @health_endpoint, @is_active, @is_external, @manifest_key)`,
      )
      .run(data);
    return id;
  }

  function insertDependency(
    serviceId: string,
    name: string,
    canonicalName: string | null = null,
  ) {
    const id = randomUUID();
    testDb
      .prepare(
        `INSERT INTO dependencies (id, service_id, name, canonical_name)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, serviceId, name, canonicalName);
    return id;
  }

  function insertOverride(
    canonicalName: string,
    impactOverride: string | null,
    teamId: string | null = null,
  ) {
    const id = randomUUID();
    testDb
      .prepare(
        `INSERT INTO dependency_canonical_overrides (id, canonical_name, team_id, impact_override)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, canonicalName, teamId, impactOverride);
    return id;
  }

  function insertAlias(alias: string, canonicalName: string) {
    const id = randomUUID();
    testDb
      .prepare(
        `INSERT INTO dependency_aliases (id, alias, canonical_name)
         VALUES (?, ?, ?)`,
      )
      .run(id, alias, canonicalName);
    return id;
  }

  it('should return external canonical names with team usage', async () => {
    const svcA = insertService({ name: 'Alpha Svc', team_id: teamAId });
    const svcB = insertService({ name: 'Beta Svc', team_id: teamBId });

    insertDependency(svcA, 'pg-dep', 'postgresql');
    insertDependency(svcB, 'pg-dep', 'postgresql');
    insertDependency(svcA, 'redis-dep', 'redis');

    const res = await request(app).get('/api/catalog/external-dependencies');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const pg = res.body.find((e: { canonical_name: string }) => e.canonical_name === 'postgresql');
    expect(pg).toBeDefined();
    expect(pg.teams).toHaveLength(2);
    expect(pg.teams.map((t: { name: string }) => t.name).sort()).toEqual([
      'Team Alpha',
      'Team Beta',
    ]);
    expect(pg.usage_count).toBe(2);

    const redis = res.body.find(
      (e: { canonical_name: string }) => e.canonical_name === 'redis',
    );
    expect(redis).toBeDefined();
    expect(redis.teams).toHaveLength(1);
    expect(redis.usage_count).toBe(1);
  });

  it('should exclude canonical names matching internal service names', async () => {
    // "auth-service" is both a service name and a canonical name used as a dependency
    const authSvc = insertService({ name: 'auth-service', team_id: teamAId });
    const otherSvc = insertService({ name: 'Other Svc', team_id: teamBId });

    insertDependency(otherSvc, 'auth-dep', 'auth-service'); // matches service name
    insertDependency(otherSvc, 'pg-dep', 'postgresql'); // does not match

    const res = await request(app).get('/api/catalog/external-dependencies');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].canonical_name).toBe('postgresql');
  });

  it('should exclude canonical names matching internal service manifest_key', async () => {
    insertService({ name: 'Auth Service', team_id: teamAId, manifest_key: 'auth-svc' });
    const otherSvc = insertService({ name: 'Other', team_id: teamBId });

    insertDependency(otherSvc, 'dep1', 'auth-svc'); // matches manifest_key
    insertDependency(otherSvc, 'dep2', 'rabbitmq'); // external

    const res = await request(app).get('/api/catalog/external-dependencies');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].canonical_name).toBe('rabbitmq');
  });

  it('should include global override description', async () => {
    const svc = insertService({ name: 'Svc', team_id: teamAId });
    insertDependency(svc, 'pg', 'postgresql');
    insertOverride('postgresql', 'Primary relational database');

    const res = await request(app).get('/api/catalog/external-dependencies');

    expect(res.status).toBe(200);
    expect(res.body[0].description).toBe('Primary relational database');
  });

  it('should use global override, not team-scoped override, for description', async () => {
    const svc = insertService({ name: 'Svc', team_id: teamAId });
    insertDependency(svc, 'pg', 'postgresql');
    insertOverride('postgresql', 'Global description');
    insertOverride('postgresql', 'Team-scoped description', teamAId);

    const res = await request(app).get('/api/catalog/external-dependencies');

    expect(res.status).toBe(200);
    expect(res.body[0].description).toBe('Global description');
  });

  it('should return null description when no global override exists', async () => {
    const svc = insertService({ name: 'Svc', team_id: teamAId });
    insertDependency(svc, 'pg', 'postgresql');

    const res = await request(app).get('/api/catalog/external-dependencies');

    expect(res.status).toBe(200);
    expect(res.body[0].description).toBeNull();
  });

  it('should include aliases for canonical names', async () => {
    const svc = insertService({ name: 'Svc', team_id: teamAId });
    insertDependency(svc, 'pg', 'postgresql');
    insertAlias('pg', 'postgresql');
    insertAlias('postgres', 'postgresql');

    const res = await request(app).get('/api/catalog/external-dependencies');

    expect(res.status).toBe(200);
    expect(res.body[0].aliases.sort()).toEqual(['pg', 'postgres']);
  });

  it('should return empty aliases array when none exist', async () => {
    const svc = insertService({ name: 'Svc', team_id: teamAId });
    insertDependency(svc, 'pg', 'postgresql');

    const res = await request(app).get('/api/catalog/external-dependencies');

    expect(res.status).toBe(200);
    expect(res.body[0].aliases).toEqual([]);
  });

  it('should filter by search on canonical_name', async () => {
    const svc = insertService({ name: 'Svc', team_id: teamAId });
    insertDependency(svc, 'dep1', 'postgresql');
    insertDependency(svc, 'dep2', 'redis');
    insertDependency(svc, 'dep3', 'rabbitmq');

    const res = await request(app).get(
      '/api/catalog/external-dependencies?search=post',
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].canonical_name).toBe('postgresql');
  });

  it('should filter by search on alias', async () => {
    const svc = insertService({ name: 'Svc', team_id: teamAId });
    insertDependency(svc, 'dep1', 'postgresql');
    insertDependency(svc, 'dep2', 'redis');
    insertAlias('pg', 'postgresql');

    const res = await request(app).get(
      '/api/catalog/external-dependencies?search=pg',
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].canonical_name).toBe('postgresql');
  });

  it('should be case-insensitive when searching', async () => {
    const svc = insertService({ name: 'Svc', team_id: teamAId });
    insertDependency(svc, 'dep1', 'PostgreSQL');

    const res = await request(app).get(
      '/api/catalog/external-dependencies?search=POST',
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('should return empty array when no external dependencies exist', async () => {
    const res = await request(app).get('/api/catalog/external-dependencies');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should skip dependencies with null canonical_name', async () => {
    const svc = insertService({ name: 'Svc', team_id: teamAId });
    insertDependency(svc, 'dep-no-canonical', null);
    insertDependency(svc, 'dep-with-canonical', 'postgresql');

    const res = await request(app).get('/api/catalog/external-dependencies');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].canonical_name).toBe('postgresql');
  });

  it('should include team key in team info', async () => {
    const svc = insertService({ name: 'Svc', team_id: teamAId });
    insertDependency(svc, 'dep', 'postgresql');

    const res = await request(app).get('/api/catalog/external-dependencies');

    expect(res.status).toBe(200);
    expect(res.body[0].teams[0]).toEqual({
      id: teamAId,
      name: 'Team Alpha',
      key: 'team-alpha',
    });
  });

  it('should not duplicate teams when multiple deps share a canonical name', async () => {
    const svc = insertService({ name: 'Svc', team_id: teamAId });
    insertDependency(svc, 'dep1', 'postgresql');
    insertDependency(svc, 'dep2', 'postgresql');

    const res = await request(app).get('/api/catalog/external-dependencies');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    // DISTINCT in SQL ensures no duplicates
    expect(res.body[0].teams).toHaveLength(1);
    expect(res.body[0].usage_count).toBe(2);
  });
});
