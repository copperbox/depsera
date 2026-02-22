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

import latencyRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/latency', latencyRouter);

describe('Latency API', () => {
  const testDependencyId = 'dep-123';

  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE dependencies (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        name TEXT NOT NULL,
        latency_ms INTEGER
      );

      CREATE TABLE dependency_latency_history (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        recorded_at TEXT NOT NULL
      );

      INSERT INTO dependencies (id, service_id, name, latency_ms)
      VALUES ('${testDependencyId}', 'svc-1', 'Test Dep', 50);

      INSERT INTO dependency_latency_history (id, dependency_id, latency_ms, recorded_at)
      VALUES
        ('hist-1', '${testDependencyId}', 45, datetime('now')),
        ('hist-2', '${testDependencyId}', 55, datetime('now'));
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/latency/:dependencyId', () => {
    it('should return latency stats', async () => {
      const response = await request(app).get(`/api/latency/${testDependencyId}`);

      expect(response.status).toBe(200);
      expect(response.body.dependencyId).toBe(testDependencyId);
      expect(response.body.currentLatencyMs).toBe(50);
      expect(response.body.dataPoints).toBeDefined();
      expect(Array.isArray(response.body.dataPoints)).toBe(true);
    });

    it('should return 404 for non-existent dependency', async () => {
      const response = await request(app).get('/api/latency/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Dependency not found');
    });
  });
});
