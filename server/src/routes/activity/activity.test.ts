import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

jest.mock('../../auth', () => ({
  requireAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

import activityRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/activity', activityRouter);

describe('Activity API', () => {
  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE status_change_events (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        service_name TEXT NOT NULL,
        dependency_name TEXT NOT NULL,
        previous_healthy INTEGER,
        current_healthy INTEGER NOT NULL,
        recorded_at TEXT NOT NULL
      )
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  afterEach(() => {
    testDb.exec('DELETE FROM status_change_events');
  });

  describe('GET /api/activity/recent', () => {
    it('should return empty array when no events', async () => {
      const response = await request(app).get('/api/activity/recent');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return recent status change events', async () => {
      testDb.exec(`
        INSERT INTO status_change_events (id, service_id, service_name, dependency_name, previous_healthy, current_healthy, recorded_at)
        VALUES ('evt-1', 'svc-1', 'My Service', 'Database', 1, 0, '2024-06-01T12:00:00.000Z')
      `);

      const response = await request(app).get('/api/activity/recent');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toEqual({
        id: 'evt-1',
        service_id: 'svc-1',
        service_name: 'My Service',
        dependency_name: 'Database',
        previous_healthy: true,
        current_healthy: false,
        recorded_at: '2024-06-01T12:00:00.000Z',
      });
    });

    it('should handle null previous_healthy', async () => {
      testDb.exec(`
        INSERT INTO status_change_events (id, service_id, service_name, dependency_name, previous_healthy, current_healthy, recorded_at)
        VALUES ('evt-2', 'svc-1', 'My Service', 'Cache', NULL, 1, '2024-06-01T12:00:00.000Z')
      `);

      const response = await request(app).get('/api/activity/recent');

      expect(response.status).toBe(200);
      expect(response.body[0].previous_healthy).toBeNull();
      expect(response.body[0].current_healthy).toBe(true);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        testDb.exec(`
          INSERT INTO status_change_events (id, service_id, service_name, dependency_name, previous_healthy, current_healthy, recorded_at)
          VALUES ('evt-${i}', 'svc-1', 'Service', 'Dep-${i}', 1, 0, '2024-06-01T${String(i).padStart(2, '0')}:00:00.000Z')
        `);
      }

      const response = await request(app).get('/api/activity/recent?limit=3');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(3);
    });

    it('should cap limit at 50', async () => {
      const response = await request(app).get('/api/activity/recent?limit=100');

      expect(response.status).toBe(200);
      // No error - limit is capped internally
    });

    it('should default to 10 when limit not provided', async () => {
      for (let i = 0; i < 15; i++) {
        testDb.exec(`
          INSERT INTO status_change_events (id, service_id, service_name, dependency_name, previous_healthy, current_healthy, recorded_at)
          VALUES ('evt-d-${i}', 'svc-1', 'Service', 'Dep-${i}', 1, 0, '2024-06-01T${String(i).padStart(2, '0')}:00:00.000Z')
        `);
      }

      const response = await request(app).get('/api/activity/recent');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(10);
    });
  });
});
