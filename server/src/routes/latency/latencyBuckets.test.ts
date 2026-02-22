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

describe('Latency Buckets API', () => {
  const testDependencyId = 'dep-bucket-1';

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
        ('hist-b1', '${testDependencyId}', 40, datetime('now')),
        ('hist-b2', '${testDependencyId}', 50, datetime('now')),
        ('hist-b3', '${testDependencyId}', 60, datetime('now'));
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/latency/:dependencyId/buckets', () => {
    it('should return bucketed latency data with default range', async () => {
      const response = await request(app).get(`/api/latency/${testDependencyId}/buckets`);

      expect(response.status).toBe(200);
      expect(response.body.dependencyId).toBe(testDependencyId);
      expect(response.body.range).toBe('24h');
      expect(Array.isArray(response.body.buckets)).toBe(true);
      expect(response.body.buckets.length).toBeGreaterThanOrEqual(1);

      const bucket = response.body.buckets[0];
      expect(bucket.timestamp).toBeDefined();
      expect(bucket.min).toBe(40);
      expect(bucket.avg).toBe(50);
      expect(bucket.max).toBe(60);
      expect(bucket.count).toBe(3);
    });

    it('should accept explicit range parameter', async () => {
      const response = await request(app).get(`/api/latency/${testDependencyId}/buckets?range=1h`);

      expect(response.status).toBe(200);
      expect(response.body.range).toBe('1h');
      expect(response.body.buckets.length).toBeGreaterThanOrEqual(1);
    });

    it('should return 400 for invalid range', async () => {
      const response = await request(app).get(`/api/latency/${testDependencyId}/buckets?range=2h`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid range');
    });

    it('should return 404 for non-existent dependency', async () => {
      const response = await request(app).get('/api/latency/non-existent/buckets');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Dependency not found');
    });

    it('should accept all valid range values', async () => {
      for (const range of ['1h', '6h', '24h', '7d', '30d']) {
        const response = await request(app).get(`/api/latency/${testDependencyId}/buckets?range=${range}`);
        expect(response.status).toBe(200);
        expect(response.body.range).toBe(range);
      }
    });
  });
});
