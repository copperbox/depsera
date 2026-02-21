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

// Default admin user for tests — admin sees all services (no team filtering)
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

describe('Services API', () => {
  let teamId: string;
  let serviceId: string;

  beforeAll(() => {
    // Enable foreign keys
    testDb.pragma('foreign_keys = ON');

    // Create tables
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
      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        health_endpoint TEXT NOT NULL,
        metrics_endpoint TEXT,
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_poll_success INTEGER,
        last_poll_error TEXT,
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
        is_dismissed INTEGER NOT NULL DEFAULT 0,
        dismissed_by TEXT,
        dismissed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE,
        FOREIGN KEY (linked_service_id) REFERENCES services(id) ON DELETE CASCADE,
        UNIQUE (dependency_id, linked_service_id)
      )
    `);

    // Create a test team
    teamId = randomUUID();
    testDb.prepare(`
      INSERT INTO teams (id, name, description)
      VALUES (?, ?, ?)
    `).run(teamId, 'Test Team', 'A team for testing');
  });

  beforeEach(() => {
    // Clear data before each test
    testDb.exec('DELETE FROM dependency_associations');
    testDb.exec('DELETE FROM dependencies');
    testDb.exec('DELETE FROM services');
  });

  afterAll(() => {
    testDb.close();
  });

  describe('POST /api/services', () => {
    it('should create a new service with required fields', async () => {
      const response = await request(app)
        .post('/api/services')
        .send({
          name: 'Test Service',
          team_id: teamId,
          health_endpoint: 'https://example.com/health',
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Test Service');
      expect(response.body.team_id).toBe(teamId);
      expect(response.body.health_endpoint).toBe('https://example.com/health');
      expect(response.body.team).toBeDefined();
      expect(response.body.health.status).toBe('unknown');

      serviceId = response.body.id;
    });

    it('should create a service with all optional fields', async () => {
      const response = await request(app)
        .post('/api/services')
        .send({
          name: 'Full Service',
          team_id: teamId,
          health_endpoint: 'https://example.com/health',
          metrics_endpoint: 'https://example.com/metrics',
        });

      expect(response.status).toBe(201);
      expect(response.body.metrics_endpoint).toBe('https://example.com/metrics');
    });

    it('should create a service with custom poll_interval_ms', async () => {
      const response = await request(app)
        .post('/api/services')
        .send({
          name: 'Interval Service',
          team_id: teamId,
          health_endpoint: 'https://example.com/health',
          poll_interval_ms: 60000,
        });

      expect(response.status).toBe(201);
      expect(response.body.poll_interval_ms).toBe(60000);
    });

    it('should reject poll_interval_ms below minimum', async () => {
      const response = await request(app)
        .post('/api/services')
        .send({
          name: 'Bad Interval',
          team_id: teamId,
          health_endpoint: 'https://example.com/health',
          poll_interval_ms: 1000,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('poll_interval_ms');
    });

    it('should reject poll_interval_ms above maximum', async () => {
      const response = await request(app)
        .post('/api/services')
        .send({
          name: 'Bad Interval',
          team_id: teamId,
          health_endpoint: 'https://example.com/health',
          poll_interval_ms: 4000000,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('poll_interval_ms');
    });

    it('should reject invalid health_endpoint URL', async () => {
      const response = await request(app)
        .post('/api/services')
        .send({
          name: 'Bad Service',
          team_id: teamId,
          health_endpoint: 'not-a-url',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('health_endpoint');
    });

    it('should reject invalid metrics_endpoint URL', async () => {
      const response = await request(app)
        .post('/api/services')
        .send({
          name: 'Bad Service',
          team_id: teamId,
          health_endpoint: 'https://example.com/health',
          metrics_endpoint: 'not-a-url',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('metrics_endpoint');
    });

    it('should reject non-existent team', async () => {
      const response = await request(app)
        .post('/api/services')
        .send({
          name: 'Orphan Service',
          team_id: randomUUID(),
          health_endpoint: 'https://example.com/health',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Team not found');
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/services')
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/services', () => {
    beforeEach(() => {
      // Create test services
      const service1Id = randomUUID();
      const service2Id = randomUUID();

      testDb.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES (?, ?, ?, ?)
      `).run(service1Id, 'Service A', teamId, 'https://a.example.com/health');

      testDb.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES (?, ?, ?, ?)
      `).run(service2Id, 'Service B', teamId, 'https://b.example.com/health');

      // Add dependencies to Service A
      testDb.prepare(`
        INSERT INTO dependencies (id, service_id, name, healthy, health_state)
        VALUES (?, ?, ?, ?, ?)
      `).run(randomUUID(), service1Id, 'Database', 1, 0);

      testDb.prepare(`
        INSERT INTO dependencies (id, service_id, name, healthy, health_state)
        VALUES (?, ?, ?, ?, ?)
      `).run(randomUUID(), service1Id, 'Cache', 0, 2);

      serviceId = service1Id;
    });

    it('should list all services with dependencies and dependent_reports', async () => {
      const response = await request(app).get('/api/services');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].team).toBeDefined();
      expect(response.body[0].health).toBeDefined();
      expect(response.body[0].dependencies).toBeDefined();
      expect(Array.isArray(response.body[0].dependencies)).toBe(true);
      expect(response.body[0].dependent_reports).toBeDefined();
      expect(Array.isArray(response.body[0].dependent_reports)).toBe(true);
    });

    it('should filter by team_id', async () => {
      // Create another team with a service
      const otherTeamId = randomUUID();
      testDb.prepare(`
        INSERT INTO teams (id, name, description)
        VALUES (?, ?, ?)
      `).run(otherTeamId, 'Other Team', 'Another team');

      testDb.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES (?, ?, ?, ?)
      `).run(randomUUID(), 'Other Service', otherTeamId, 'https://other.example.com/health');

      const response = await request(app)
        .get('/api/services')
        .query({ team_id: teamId });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      response.body.forEach((service: { team_id: string }) => {
        expect(service.team_id).toBe(teamId);
      });
    });

    it('should include correct health status and dependencies', async () => {
      const response = await request(app).get('/api/services');

      // Service A has dependencies
      const serviceA = response.body.find((s: { name: string }) => s.name === 'Service A');
      expect(serviceA.dependencies).toHaveLength(2);
      expect(serviceA.health).toBeDefined();
      expect(serviceA.health.status).toBe('warning'); // derived from own deps (1 healthy, 1 critical = 50%)

      // Service B has no dependencies
      const serviceB = response.body.find((s: { name: string }) => s.name === 'Service B');
      expect(serviceB.dependencies).toHaveLength(0);
      expect(serviceB.health.status).toBe('unknown');
    });

    it('should reject SQL injection via orderBy', async () => {
      const response = await request(app)
        .get('/api/services')
        .query({ orderBy: 'name;DROP TABLE services' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should reject invalid orderBy column', async () => {
      const response = await request(app)
        .get('/api/services')
        .query({ orderBy: 'nonexistent_column' });

      expect(response.status).toBe(400);
    });

    it('should accept valid orderBy column', async () => {
      const response = await request(app)
        .get('/api/services')
        .query({ orderBy: 'name' });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/services/:id', () => {
    beforeEach(() => {
      serviceId = randomUUID();
      testDb.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES (?, ?, ?, ?)
      `).run(serviceId, 'Detail Service', teamId, 'https://detail.example.com/health');

      testDb.prepare(`
        INSERT INTO dependencies (id, service_id, name, healthy, health_state, latency_ms)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), serviceId, 'Primary DB', 1, 0, 5);
    });

    it('should return service details with dependencies', async () => {
      const response = await request(app).get(`/api/services/${serviceId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(serviceId);
      expect(response.body.name).toBe('Detail Service');
      expect(response.body.team).toBeDefined();
      expect(response.body.dependencies).toHaveLength(1);
      expect(response.body.dependencies[0].name).toBe('Primary DB');
      expect(response.body.health.status).toBe('healthy');
    });

    it('should return 404 for non-existent service', async () => {
      const response = await request(app).get(`/api/services/${randomUUID()}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Service not found');
    });
  });

  describe('PUT /api/services/:id', () => {
    beforeEach(() => {
      serviceId = randomUUID();
      testDb.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES (?, ?, ?, ?)
      `).run(serviceId, 'Update Service', teamId, 'https://update.example.com/health');
    });

    it('should update service name', async () => {
      const response = await request(app)
        .put(`/api/services/${serviceId}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Name');
    });

    it('should update multiple fields', async () => {
      const response = await request(app)
        .put(`/api/services/${serviceId}`)
        .send({
          name: 'Multi Update',
          health_endpoint: 'https://new.example.com/health',
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Multi Update');
      expect(response.body.health_endpoint).toBe('https://new.example.com/health');
    });

    it('should update is_active status', async () => {
      const response = await request(app)
        .put(`/api/services/${serviceId}`)
        .send({ is_active: false });

      expect(response.status).toBe(200);
      expect(response.body.is_active).toBe(0);
    });

    it('should update poll_interval_ms', async () => {
      const response = await request(app)
        .put(`/api/services/${serviceId}`)
        .send({ poll_interval_ms: 60000 });

      expect(response.status).toBe(200);
      expect(response.body.poll_interval_ms).toBe(60000);
    });

    it('should reject invalid poll_interval_ms on update', async () => {
      const response = await request(app)
        .put(`/api/services/${serviceId}`)
        .send({ poll_interval_ms: 100 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('poll_interval_ms');
    });

    it('should reject invalid URL on update', async () => {
      const response = await request(app)
        .put(`/api/services/${serviceId}`)
        .send({ health_endpoint: 'bad-url' });

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent service', async () => {
      const response = await request(app)
        .put(`/api/services/${randomUUID()}`)
        .send({ name: 'Ghost' });

      expect(response.status).toBe(404);
    });

    it('should reject empty update', async () => {
      const response = await request(app)
        .put(`/api/services/${serviceId}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('No valid fields');
    });
  });

  describe('DELETE /api/services/:id', () => {
    beforeEach(() => {
      serviceId = randomUUID();
      testDb.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES (?, ?, ?, ?)
      `).run(serviceId, 'Delete Service', teamId, 'https://delete.example.com/health');

      // Add a dependency
      testDb.prepare(`
        INSERT INTO dependencies (id, service_id, name, healthy)
        VALUES (?, ?, ?, ?)
      `).run(randomUUID(), serviceId, 'Test Dep', 1);
    });

    it('should delete service and cascade to dependencies', async () => {
      const response = await request(app).delete(`/api/services/${serviceId}`);

      expect(response.status).toBe(204);

      // Verify service is deleted
      const service = testDb.prepare('SELECT * FROM services WHERE id = ?').get(serviceId);
      expect(service).toBeUndefined();

      // Verify dependencies are also deleted (cascade)
      const deps = testDb.prepare('SELECT * FROM dependencies WHERE service_id = ?').all(serviceId);
      expect(deps).toHaveLength(0);
    });

    it('should return 404 for non-existent service', async () => {
      const response = await request(app).delete(`/api/services/${randomUUID()}`);

      expect(response.status).toBe(404);
    });
  });
});
