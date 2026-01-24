import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

// Create in-memory database for testing
const testDb = new Database(':memory:');

// Mock the db module
jest.mock('../../db', () => testDb);

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
        polling_interval INTEGER NOT NULL DEFAULT 30,
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

    // Create a test team
    teamId = randomUUID();
    testDb.prepare(`
      INSERT INTO teams (id, name, description)
      VALUES (?, ?, ?)
    `).run(teamId, 'Test Team', 'A team for testing');
  });

  beforeEach(() => {
    // Clear services and dependencies before each test
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
      expect(response.body.polling_interval).toBe(30); // default
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
          polling_interval: 60,
        });

      expect(response.status).toBe(201);
      expect(response.body.metrics_endpoint).toBe('https://example.com/metrics');
      expect(response.body.polling_interval).toBe(60);
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

    it('should reject polling_interval below minimum', async () => {
      const response = await request(app)
        .post('/api/services')
        .send({
          name: 'Bad Service',
          team_id: teamId,
          health_endpoint: 'https://example.com/health',
          polling_interval: 5,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('polling_interval');
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
        INSERT INTO services (id, name, team_id, health_endpoint, polling_interval)
        VALUES (?, ?, ?, ?, ?)
      `).run(service1Id, 'Service A', teamId, 'https://a.example.com/health', 30);

      testDb.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint, polling_interval)
        VALUES (?, ?, ?, ?, ?)
      `).run(service2Id, 'Service B', teamId, 'https://b.example.com/health', 60);

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

    it('should list all services', async () => {
      const response = await request(app).get('/api/services');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].team).toBeDefined();
      expect(response.body[0].health).toBeDefined();
    });

    it('should filter by team_id', async () => {
      // Create another team with a service
      const otherTeamId = randomUUID();
      testDb.prepare(`
        INSERT INTO teams (id, name, description)
        VALUES (?, ?, ?)
      `).run(otherTeamId, 'Other Team', 'Another team');

      testDb.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint, polling_interval)
        VALUES (?, ?, ?, ?, ?)
      `).run(randomUUID(), 'Other Service', otherTeamId, 'https://other.example.com/health', 30);

      const response = await request(app)
        .get('/api/services')
        .query({ team_id: teamId });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      response.body.forEach((service: { team_id: string }) => {
        expect(service.team_id).toBe(teamId);
      });
    });

    it('should include correct health status', async () => {
      const response = await request(app).get('/api/services');

      // Service A has mixed dependencies (one healthy, one unhealthy)
      const serviceA = response.body.find((s: { name: string }) => s.name === 'Service A');
      expect(serviceA.health.status).toBe('unhealthy');
      expect(serviceA.health.healthy_count).toBe(1);
      expect(serviceA.health.unhealthy_count).toBe(1);
      expect(serviceA.health.total_dependencies).toBe(2);

      // Service B has no dependencies
      const serviceB = response.body.find((s: { name: string }) => s.name === 'Service B');
      expect(serviceB.health.status).toBe('unknown');
      expect(serviceB.health.total_dependencies).toBe(0);
    });
  });

  describe('GET /api/services/:id', () => {
    beforeEach(() => {
      serviceId = randomUUID();
      testDb.prepare(`
        INSERT INTO services (id, name, team_id, health_endpoint, polling_interval)
        VALUES (?, ?, ?, ?, ?)
      `).run(serviceId, 'Detail Service', teamId, 'https://detail.example.com/health', 30);

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
        INSERT INTO services (id, name, team_id, health_endpoint, polling_interval)
        VALUES (?, ?, ?, ?, ?)
      `).run(serviceId, 'Update Service', teamId, 'https://update.example.com/health', 30);
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
          polling_interval: 45,
        });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Multi Update');
      expect(response.body.health_endpoint).toBe('https://new.example.com/health');
      expect(response.body.polling_interval).toBe(45);
    });

    it('should update is_active status', async () => {
      const response = await request(app)
        .put(`/api/services/${serviceId}`)
        .send({ is_active: false });

      expect(response.status).toBe(200);
      expect(response.body.is_active).toBe(0);
    });

    it('should reject invalid URL on update', async () => {
      const response = await request(app)
        .put(`/api/services/${serviceId}`)
        .send({ health_endpoint: 'bad-url' });

      expect(response.status).toBe(400);
    });

    it('should reject invalid polling_interval on update', async () => {
      const response = await request(app)
        .put(`/api/services/${serviceId}`)
        .send({ polling_interval: 5 });

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
        INSERT INTO services (id, name, team_id, health_endpoint, polling_interval)
        VALUES (?, ?, ?, ?, ?)
      `).run(serviceId, 'Delete Service', teamId, 'https://delete.example.com/health', 30);

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
