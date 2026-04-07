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

// Mock the auth module
jest.mock('../../auth', () => ({
  requireAuth: jest.fn((_req, _res, next) => next()),
  requireAdmin: jest.fn((_req, _res, next) => next()),
  requireTeamAccess: jest.fn((_req, _res, next) => next()),
  requireTeamLead: jest.fn((_req, _res, next) => next()),
  requireServiceTeamLead: jest.fn((_req, _res, next) => next()),
  requireBodyTeamLead: jest.fn((_req, _res, next) => next()),
}));

import { StoreRegistry } from '../../stores';
import dependenciesRouter from './index';

const adminUser = {
  id: 'admin-test-user-id',
  email: 'admin@test.com',
  name: 'Admin',
  oidc_subject: null,
  password_hash: null,
  role: 'admin' as const,
  is_active: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = adminUser;
  next();
});
app.use('/api/dependencies', dependenciesRouter);

describe('Dependency Enrichment API', () => {
  let teamId: string;
  let serviceId: string;
  let dependencyId: string;

  beforeAll(() => {
    testDb.pragma('foreign_keys = ON');

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        contact TEXT,
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
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
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
        health_state INTEGER,
        health_code INTEGER,
        latency_ms REAL,
        contact TEXT,
        check_details TEXT,
        error TEXT,
        error_message TEXT,
        skipped INTEGER NOT NULL DEFAULT 0,
        discovery_source TEXT NOT NULL DEFAULT 'manual',
        user_display_name TEXT,
        user_description TEXT,
        user_impact TEXT,
        status TEXT NOT NULL DEFAULT 'unknown',
        last_checked TEXT,
        last_status_change TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        UNIQUE(service_id, name)
      )
    `);
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM dependencies');
    testDb.exec('DELETE FROM services');
    testDb.exec('DELETE FROM teams');
    StoreRegistry.resetInstance();
    jest.clearAllMocks();

    teamId = randomUUID();
    testDb.prepare('INSERT INTO teams (id, name) VALUES (?, ?)').run(teamId, 'Test Team');

    serviceId = randomUUID();
    testDb.prepare('INSERT INTO services (id, name, team_id, health_endpoint) VALUES (?, ?, ?, ?)')
      .run(serviceId, 'Test Service', teamId, 'https://example.com/health');

    dependencyId = randomUUID();
    testDb.prepare(`
      INSERT INTO dependencies (id, service_id, name, status, discovery_source)
      VALUES (?, ?, ?, ?, ?)
    `).run(dependencyId, serviceId, 'postgres-db', 'healthy', 'otlp_trace');
  });

  afterAll(() => {
    testDb.close();
  });

  describe('PATCH /api/dependencies/:id/enrich', () => {
    it('should update user enrichment fields', async () => {
      const response = await request(app)
        .patch(`/api/dependencies/${dependencyId}/enrich`)
        .send({ displayName: 'PostgreSQL Primary', description: 'Main database', impact: 'Critical' });

      expect(response.status).toBe(200);
      expect(response.body.user_display_name).toBe('PostgreSQL Primary');
      expect(response.body.user_description).toBe('Main database');
      expect(response.body.user_impact).toBe('Critical');
    });

    it('should allow partial update (only displayName)', async () => {
      const response = await request(app)
        .patch(`/api/dependencies/${dependencyId}/enrich`)
        .send({ displayName: 'PostgreSQL Primary' });

      expect(response.status).toBe(200);
      expect(response.body.user_display_name).toBe('PostgreSQL Primary');
      expect(response.body.user_description).toBeNull();
    });

    it('should persist enrichment across subsequent calls', async () => {
      await request(app)
        .patch(`/api/dependencies/${dependencyId}/enrich`)
        .send({ displayName: 'PostgreSQL Primary', description: 'Main DB' });

      // Update only impact
      const response = await request(app)
        .patch(`/api/dependencies/${dependencyId}/enrich`)
        .send({ impact: 'Critical' });

      expect(response.status).toBe(200);
      // displayName was set in previous call, should still be there
      expect(response.body.user_display_name).toBe('PostgreSQL Primary');
      expect(response.body.user_impact).toBe('Critical');
    });

    it('should return 404 for non-existent dependency', async () => {
      const response = await request(app)
        .patch('/api/dependencies/non-existent/enrich')
        .send({ displayName: 'Test' });

      expect(response.status).toBe(404);
    });

    it('should return 400 when no enrichment fields provided', async () => {
      const response = await request(app)
        .patch(`/api/dependencies/${dependencyId}/enrich`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('At least one enrichment field');
    });
  });
});
