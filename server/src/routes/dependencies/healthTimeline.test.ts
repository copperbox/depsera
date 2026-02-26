import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

jest.mock('../../auth', () => ({
  requireAuth: jest.fn((_req, _res, next) => next()),
}));

import dependenciesRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/dependencies', dependenciesRouter);

describe('Health Timeline API', () => {
  const testDependencyId = 'dep-timeline-1';

  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE dependencies (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        name TEXT NOT NULL,
        healthy INTEGER,
        health_state INTEGER,
        latency_ms INTEGER,
        skipped INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE dependency_error_history (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        error TEXT,
        error_message TEXT,
        recorded_at TEXT NOT NULL
      );

      INSERT INTO dependencies (id, service_id, name, healthy, health_state, latency_ms)
      VALUES ('${testDependencyId}', 'svc-1', 'Test Dep', 1, 0, 50);

      INSERT INTO dependency_error_history (id, dependency_id, error, error_message, recorded_at)
      VALUES
        ('err-1', '${testDependencyId}', '{"code":500}', 'Server error', datetime('now', '-10 minutes')),
        ('err-2', '${testDependencyId}', NULL, NULL, datetime('now', '-5 minutes'));
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/dependencies/:id/timeline', () => {
    it('should return health timeline with default range', async () => {
      const response = await request(app).get(`/api/dependencies/${testDependencyId}/timeline`);

      expect(response.status).toBe(200);
      expect(response.body.dependencyId).toBe(testDependencyId);
      expect(response.body.range).toBe('24h');
      expect(response.body.currentState).toBe('healthy');
      expect(Array.isArray(response.body.transitions)).toBe(true);
      expect(response.body.transitions).toHaveLength(2);

      expect(response.body.transitions[0].state).toBe('unhealthy');
      expect(response.body.transitions[1].state).toBe('healthy');
    });

    it('should accept explicit range parameter', async () => {
      const response = await request(app).get(`/api/dependencies/${testDependencyId}/timeline?range=7d`);

      expect(response.status).toBe(200);
      expect(response.body.range).toBe('7d');
    });

    it('should return 400 for invalid range', async () => {
      const response = await request(app).get(`/api/dependencies/${testDependencyId}/timeline?range=1h`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid range');
    });

    it('should return 404 for non-existent dependency', async () => {
      const response = await request(app).get('/api/dependencies/non-existent/timeline');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Dependency not found');
    });

    it('should accept all valid range values', async () => {
      for (const range of ['24h', '7d', '30d']) {
        const response = await request(app).get(`/api/dependencies/${testDependencyId}/timeline?range=${range}`);
        expect(response.status).toBe(200);
        expect(response.body.range).toBe(range);
      }
    });

    it('should report unhealthy current state for unhealthy dependency', async () => {
      const unhealthyDepId = 'dep-unhealthy-1';
      testDb.exec(`
        INSERT INTO dependencies (id, service_id, name, healthy, health_state, latency_ms)
        VALUES ('${unhealthyDepId}', 'svc-1', 'Unhealthy Dep', 0, 2, 100);
      `);

      const response = await request(app).get(`/api/dependencies/${unhealthyDepId}/timeline`);

      expect(response.status).toBe(200);
      expect(response.body.currentState).toBe('unhealthy');
    });

    it('should report unknown current state when healthy is null', async () => {
      const unknownDepId = 'dep-unknown-1';
      testDb.exec(`
        INSERT INTO dependencies (id, service_id, name, healthy, health_state, latency_ms)
        VALUES ('${unknownDepId}', 'svc-1', 'Unknown Dep', NULL, NULL, NULL);
      `);

      const response = await request(app).get(`/api/dependencies/${unknownDepId}/timeline`);

      expect(response.status).toBe(200);
      expect(response.body.currentState).toBe('unknown');
    });
  });
});
