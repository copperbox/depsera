import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

// Create in-memory database for testing
const testDb = new Database(':memory:');

// Mock the db module
jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

const adminUserId = 'test-admin-user-id';
const defaultAdminUser = {
  id: adminUserId,
  email: 'admin@test.com',
  name: 'Test Admin',
  oidc_subject: null,
  role: 'admin' as const,
  is_active: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

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

import externalServicesRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/external-services', externalServicesRouter);

describe('External Services API', () => {
  let teamId: string;

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
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS team_members (
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (team_id, user_id),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
        type TEXT DEFAULT 'other',
        healthy INTEGER,
        health_state INTEGER,
        health_code INTEGER,
        latency_ms INTEGER,
        check_details TEXT,
        error TEXT,
        error_message TEXT,
        skipped INTEGER NOT NULL DEFAULT 0,
        last_checked TEXT,
        last_status_change TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (service_id, name)
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS dependency_associations (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        linked_service_id TEXT NOT NULL,
        association_type TEXT DEFAULT 'api_call',
        is_auto_suggested INTEGER NOT NULL DEFAULT 0,
        confidence_score REAL,
        is_dismissed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (dependency_id, linked_service_id)
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS dependency_canonical_overrides (
        id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL UNIQUE,
        contact_override TEXT,
        impact_override TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by TEXT
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Seed data
    testDb.prepare('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)').run(
      adminUserId, 'admin@test.com', 'Test Admin', 'admin'
    );

    teamId = randomUUID();
    testDb.prepare('INSERT INTO teams (id, name) VALUES (?, ?)').run(teamId, 'Test Team');

    testDb.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(
      teamId, adminUserId, 'lead'
    );
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.prepare('DELETE FROM services WHERE is_external = 1').run();
  });

  describe('POST /api/external-services', () => {
    it('should create an external service with required fields', async () => {
      const res = await request(app)
        .post('/api/external-services')
        .send({ name: 'External API', team_id: teamId });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('External API');
      expect(res.body.team_id).toBe(teamId);
      expect(res.body.description).toBeNull();
      expect(res.body.team).toBeDefined();
      expect(res.body.team.name).toBe('Test Team');
      expect(res.body.id).toBeDefined();
      expect(res.body.created_at).toBeDefined();
    });

    it('should create an external service with description', async () => {
      const res = await request(app)
        .post('/api/external-services')
        .send({ name: 'Payment Gateway', team_id: teamId, description: 'Stripe integration' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Payment Gateway');
      expect(res.body.description).toBe('Stripe integration');
    });

    it('should reject missing name', async () => {
      const res = await request(app)
        .post('/api/external-services')
        .send({ team_id: teamId });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name');
    });

    it('should reject missing team_id', async () => {
      const res = await request(app)
        .post('/api/external-services')
        .send({ name: 'Test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('team_id');
    });

    it('should reject non-existent team', async () => {
      const res = await request(app)
        .post('/api/external-services')
        .send({ name: 'Test', team_id: 'non-existent' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Team not found');
    });

    it('should store external service with is_external=1', async () => {
      const res = await request(app)
        .post('/api/external-services')
        .send({ name: 'External DB', team_id: teamId });

      expect(res.status).toBe(201);

      // Verify in database
      const row = testDb.prepare('SELECT * FROM services WHERE id = ?').get(res.body.id) as { is_external: number; health_endpoint: string };
      expect(row.is_external).toBe(1);
      expect(row.health_endpoint).toBe('');
    });
  });

  describe('GET /api/external-services', () => {
    it('should list only external services', async () => {
      // Create an external service
      await request(app)
        .post('/api/external-services')
        .send({ name: 'External 1', team_id: teamId });

      // Create a tracked service directly in DB
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, is_external) VALUES (?, ?, ?, ?, 0)'
      ).run(randomUUID(), 'Tracked Service', teamId, 'https://example.com/health');

      const res = await request(app).get('/api/external-services');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('External 1');
    });

    it('should filter by team_id', async () => {
      const team2Id = randomUUID();
      testDb.prepare('INSERT INTO teams (id, name) VALUES (?, ?)').run(team2Id, 'Team 2');

      await request(app)
        .post('/api/external-services')
        .send({ name: 'Team 1 External', team_id: teamId });

      await request(app)
        .post('/api/external-services')
        .send({ name: 'Team 2 External', team_id: team2Id });

      const res = await request(app).get(`/api/external-services?team_id=${teamId}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Team 1 External');
    });

    it('should include team info in response', async () => {
      await request(app)
        .post('/api/external-services')
        .send({ name: 'Test External', team_id: teamId });

      const res = await request(app).get('/api/external-services');

      expect(res.status).toBe(200);
      expect(res.body[0].team).toBeDefined();
      expect(res.body[0].team.id).toBe(teamId);
      expect(res.body[0].team.name).toBe('Test Team');
    });

    it('should return health, dependencies, and dependent_reports fields', async () => {
      const createRes = await request(app)
        .post('/api/external-services')
        .send({ name: 'Health External', team_id: teamId });

      const res = await request(app).get('/api/external-services');

      expect(res.status).toBe(200);
      const svc = res.body.find((s: { id: string }) => s.id === createRes.body.id);
      expect(svc).toBeDefined();
      expect(svc.health).toBeDefined();
      expect(svc.health.status).toBeDefined();
      expect(svc.health.total_reports).toBe(0);
      expect(svc.dependencies).toBeDefined();
      expect(Array.isArray(svc.dependencies)).toBe(true);
      expect(svc.dependent_reports).toBeDefined();
      expect(Array.isArray(svc.dependent_reports)).toBe(true);
    });
  });

  describe('PUT /api/external-services/:id', () => {
    it('should update external service name', async () => {
      const createRes = await request(app)
        .post('/api/external-services')
        .send({ name: 'Original', team_id: teamId });

      const res = await request(app)
        .put(`/api/external-services/${createRes.body.id}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
    });

    it('should update external service description', async () => {
      const createRes = await request(app)
        .post('/api/external-services')
        .send({ name: 'Test', team_id: teamId });

      const res = await request(app)
        .put(`/api/external-services/${createRes.body.id}`)
        .send({ description: 'New description' });

      expect(res.status).toBe(200);
      expect(res.body.description).toBe('New description');
    });

    it('should clear description with null', async () => {
      const createRes = await request(app)
        .post('/api/external-services')
        .send({ name: 'Test', team_id: teamId, description: 'Has desc' });

      const res = await request(app)
        .put(`/api/external-services/${createRes.body.id}`)
        .send({ description: null });

      expect(res.status).toBe(200);
      expect(res.body.description).toBeNull();
    });

    it('should return 404 for non-existent service', async () => {
      const res = await request(app)
        .put('/api/external-services/non-existent')
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('should return 404 for tracked (non-external) service', async () => {
      const trackedId = randomUUID();
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, is_external) VALUES (?, ?, ?, ?, 0)'
      ).run(trackedId, 'Tracked', teamId, 'https://example.com/health');

      const res = await request(app)
        .put(`/api/external-services/${trackedId}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('should reject empty name', async () => {
      const createRes = await request(app)
        .post('/api/external-services')
        .send({ name: 'Test', team_id: teamId });

      const res = await request(app)
        .put(`/api/external-services/${createRes.body.id}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/external-services/:id', () => {
    it('should delete external service', async () => {
      const createRes = await request(app)
        .post('/api/external-services')
        .send({ name: 'To Delete', team_id: teamId });

      const res = await request(app)
        .delete(`/api/external-services/${createRes.body.id}`);

      expect(res.status).toBe(204);

      // Verify deleted
      const row = testDb.prepare('SELECT * FROM services WHERE id = ?').get(createRes.body.id);
      expect(row).toBeUndefined();
    });

    it('should return 404 for non-existent service', async () => {
      const res = await request(app)
        .delete('/api/external-services/non-existent');

      expect(res.status).toBe(404);
    });

    it('should return 404 for tracked (non-external) service', async () => {
      const trackedId = randomUUID();
      testDb.prepare(
        'INSERT INTO services (id, name, team_id, health_endpoint, is_external) VALUES (?, ?, ?, ?, 0)'
      ).run(trackedId, 'Tracked', teamId, 'https://example.com/health');

      const res = await request(app)
        .delete(`/api/external-services/${trackedId}`);

      expect(res.status).toBe(404);
    });
  });
});
