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

import associationsRouter from './index';

// Admin user used for all existing tests (authorization checks pass for admin)
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
// Set req.user to admin for all requests (handlers now require it for authorization)
app.use((req, _res, next) => {
  req.user = adminUser;
  next();
});
// Mount at /api since the router defines the full paths
app.use('/api', associationsRouter);

describe('Associations API', () => {
  let teamId: string;
  let serviceId: string;
  let linkedServiceId: string;
  let dependencyId: string;
  let associationId: string;

  beforeAll(() => {
    // Enable foreign keys
    testDb.pragma('foreign_keys = ON');

    // Create tables
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
        metrics_endpoint TEXT,
        schema_config TEXT,
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
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
        type TEXT,
        version TEXT,
        status TEXT NOT NULL DEFAULT 'unknown',
        latency_ms INTEGER,
        last_check_at TEXT,
        check_details TEXT,
        skipped INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        UNIQUE(service_id, name)
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
        UNIQUE(dependency_id, linked_service_id)
      )
    `);
  });

  beforeEach(() => {
    // Clear tables
    testDb.exec('DELETE FROM dependency_associations');
    testDb.exec('DELETE FROM dependencies');
    testDb.exec('DELETE FROM services');
    testDb.exec('DELETE FROM teams');

    // Reset mocks
    jest.clearAllMocks();

    // Create test team
    teamId = randomUUID();
    testDb.prepare(`
      INSERT INTO teams (id, name, description)
      VALUES (?, ?, ?)
    `).run(teamId, 'Test Team', 'A test team');

    // Create services
    serviceId = randomUUID();
    linkedServiceId = randomUUID();

    testDb.prepare(`
      INSERT INTO services (id, name, team_id, health_endpoint)
      VALUES (?, ?, ?, ?)
    `).run(serviceId, 'Source Service', teamId, 'https://source.example.com/health');

    testDb.prepare(`
      INSERT INTO services (id, name, team_id, health_endpoint)
      VALUES (?, ?, ?, ?)
    `).run(linkedServiceId, 'Linked Service', teamId, 'https://linked.example.com/health');

    // Create dependency
    dependencyId = randomUUID();
    testDb.prepare(`
      INSERT INTO dependencies (id, service_id, name, status)
      VALUES (?, ?, ?, ?)
    `).run(dependencyId, serviceId, 'test-dependency', 'healthy');
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/dependencies/:dependencyId/associations', () => {
    it('should return 404 for non-existent dependency', async () => {
      const response = await request(app)
        .get(`/api/dependencies/non-existent-id/associations`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Dependency not found');
    });

    it('should return empty array when no associations', async () => {
      const response = await request(app)
        .get(`/api/dependencies/${dependencyId}/associations`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return associations with linked service', async () => {
      // Create an association
      associationId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type)
        VALUES (?, ?, ?, ?)
      `).run(associationId, dependencyId, linkedServiceId, 'api_call');

      const response = await request(app)
        .get(`/api/dependencies/${dependencyId}/associations`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].linked_service).toBeDefined();
      expect(response.body[0].linked_service.id).toBe(linkedServiceId);
    });
  });

  describe('POST /api/dependencies/:dependencyId/associations', () => {
    it('should return 404 for non-existent dependency', async () => {
      const response = await request(app)
        .post(`/api/dependencies/non-existent-id/associations`)
        .send({
          linked_service_id: linkedServiceId,
          association_type: 'api_call',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('Dependency');
    });

    it('should return 400 for non-existent linked service', async () => {
      const response = await request(app)
        .post(`/api/dependencies/${dependencyId}/associations`)
        .send({
          linked_service_id: 'non-existent-service',
          association_type: 'api_call',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Linked service not found');
    });

    it('should return 400 when linking to own service', async () => {
      const response = await request(app)
        .post(`/api/dependencies/${dependencyId}/associations`)
        .send({
          linked_service_id: serviceId,
          association_type: 'api_call',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('own service');
    });

    it('should create a new association', async () => {
      const response = await request(app)
        .post(`/api/dependencies/${dependencyId}/associations`)
        .send({
          linked_service_id: linkedServiceId,
          association_type: 'api_call',
        });

      expect(response.status).toBe(201);
      expect(response.body.dependency_id).toBe(dependencyId);
      expect(response.body.linked_service_id).toBe(linkedServiceId);
      expect(response.body.linked_service).toBeDefined();
    });

    it('should return 409 for duplicate association', async () => {
      // Create existing association
      associationId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type)
        VALUES (?, ?, ?, ?)
      `).run(associationId, dependencyId, linkedServiceId, 'api_call');

      const response = await request(app)
        .post(`/api/dependencies/${dependencyId}/associations`)
        .send({
          linked_service_id: linkedServiceId,
          association_type: 'api_call',
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('already exists');
    });
  });

  describe('DELETE /api/dependencies/:dependencyId/associations/:serviceId', () => {
    it('should return 404 for non-existent dependency', async () => {
      const response = await request(app)
        .delete(`/api/dependencies/non-existent-id/associations/${linkedServiceId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Dependency not found');
    });

    it('should return 404 for non-existent association', async () => {
      const response = await request(app)
        .delete(`/api/dependencies/${dependencyId}/associations/${linkedServiceId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Association not found');
    });

    it('should delete existing association', async () => {
      // Create association
      associationId = randomUUID();
      testDb.prepare(`
        INSERT INTO dependency_associations (id, dependency_id, linked_service_id, association_type)
        VALUES (?, ?, ?, ?)
      `).run(associationId, dependencyId, linkedServiceId, 'api_call');

      const response = await request(app)
        .delete(`/api/dependencies/${dependencyId}/associations/${linkedServiceId}`);

      expect(response.status).toBe(204);

      // Verify deletion
      const remaining = testDb.prepare(`
        SELECT * FROM dependency_associations WHERE id = ?
      `).get(associationId);
      expect(remaining).toBeUndefined();
    });
  });
});
