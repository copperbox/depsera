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

describe('Aggregate Latency Buckets API', () => {
  const depId1 = 'dep-agg-1';
  const depId2 = 'dep-agg-2';

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
      VALUES
        ('${depId1}', 'svc-1', 'Dep A', 40),
        ('${depId2}', 'svc-2', 'Dep B', 60);

      INSERT INTO dependency_latency_history (id, dependency_id, latency_ms, recorded_at)
      VALUES
        ('hist-a1', '${depId1}', 10, datetime('now')),
        ('hist-a2', '${depId1}', 30, datetime('now')),
        ('hist-b1', '${depId2}', 20, datetime('now')),
        ('hist-b2', '${depId2}', 40, datetime('now'));
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/latency/aggregate/buckets', () => {
    it('should return aggregated buckets across multiple dependency IDs', async () => {
      const response = await request(app)
        .get(`/api/latency/aggregate/buckets?dependencyIds=${depId1},${depId2}`);

      expect(response.status).toBe(200);
      expect(response.body.dependencyIds).toEqual([depId1, depId2]);
      expect(response.body.range).toBe('24h');
      expect(Array.isArray(response.body.buckets)).toBe(true);
      expect(response.body.buckets.length).toBeGreaterThanOrEqual(1);

      const bucket = response.body.buckets[0];
      expect(bucket.min).toBe(10);
      expect(bucket.max).toBe(40);
      expect(bucket.avg).toBe(25);
      expect(bucket.count).toBe(4);
    });

    it('should accept explicit range parameter', async () => {
      const response = await request(app)
        .get(`/api/latency/aggregate/buckets?dependencyIds=${depId1}&range=1h`);

      expect(response.status).toBe(200);
      expect(response.body.range).toBe('1h');
      expect(response.body.buckets.length).toBeGreaterThanOrEqual(1);
    });

    it('should return 400 when dependencyIds is missing', async () => {
      const response = await request(app).get('/api/latency/aggregate/buckets');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('dependencyIds');
    });

    it('should return 400 when dependencyIds is empty', async () => {
      const response = await request(app).get('/api/latency/aggregate/buckets?dependencyIds=');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('dependencyIds');
    });

    it('should return 400 for invalid range', async () => {
      const response = await request(app)
        .get(`/api/latency/aggregate/buckets?dependencyIds=${depId1}&range=2h`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid range');
    });

    it('should return empty buckets for non-existent dependency IDs', async () => {
      const response = await request(app)
        .get('/api/latency/aggregate/buckets?dependencyIds=non-existent-1,non-existent-2');

      expect(response.status).toBe(200);
      expect(response.body.buckets).toHaveLength(0);
    });

    it('should accept all valid range values', async () => {
      for (const range of ['1h', '6h', '24h', '7d', '30d']) {
        const response = await request(app)
          .get(`/api/latency/aggregate/buckets?dependencyIds=${depId1}&range=${range}`);
        expect(response.status).toBe(200);
        expect(response.body.range).toBe(range);
      }
    });

    it('should work with a single dependency ID', async () => {
      const response = await request(app)
        .get(`/api/latency/aggregate/buckets?dependencyIds=${depId1}`);

      expect(response.status).toBe(200);
      expect(response.body.buckets.length).toBeGreaterThanOrEqual(1);
      expect(response.body.buckets[0].min).toBe(10);
      expect(response.body.buckets[0].max).toBe(30);
    });
  });
});
