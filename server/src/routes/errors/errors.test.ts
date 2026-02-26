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

import errorsRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/errors', errorsRouter);

describe('Errors API', () => {
  const testDependencyId = 'dep-123';

  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE dependencies (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        name TEXT NOT NULL,
        skipped INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE dependency_error_history (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        error TEXT,
        error_message TEXT,
        recorded_at TEXT NOT NULL
      );

      INSERT INTO dependencies (id, service_id, name)
      VALUES ('${testDependencyId}', 'svc-1', 'Test Dep');

      INSERT INTO dependency_error_history (id, dependency_id, error, error_message, recorded_at)
      VALUES
        ('err-1', '${testDependencyId}', '{"code": 500}', 'Server error', datetime('now')),
        ('err-2', '${testDependencyId}', 'plain error', null, datetime('now')),
        ('err-3', '${testDependencyId}', null, null, datetime('now'));
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/errors/:dependencyId', () => {
    it('should return error history', async () => {
      const response = await request(app).get(`/api/errors/${testDependencyId}`);

      expect(response.status).toBe(200);
      expect(response.body.dependencyId).toBe(testDependencyId);
      expect(response.body.errorCount).toBeDefined();
      expect(Array.isArray(response.body.errors)).toBe(true);
    });

    it('should parse JSON errors', async () => {
      const response = await request(app).get(`/api/errors/${testDependencyId}`);

      const jsonError = response.body.errors.find(
        (e: { error: unknown }) => typeof e.error === 'object'
      );
      expect(jsonError).toBeDefined();
      expect(jsonError.error).toEqual({ code: 500 });
    });

    it('should handle plain string errors', async () => {
      const response = await request(app).get(`/api/errors/${testDependencyId}`);

      const plainError = response.body.errors.find(
        (e: { error: unknown }) => e.error === 'plain error'
      );
      expect(plainError).toBeDefined();
    });

    it('should mark recovery events', async () => {
      const response = await request(app).get(`/api/errors/${testDependencyId}`);

      const recovery = response.body.errors.find(
        (e: { isRecovery: boolean }) => e.isRecovery
      );
      expect(recovery).toBeDefined();
    });

    it('should return 404 for non-existent dependency', async () => {
      const response = await request(app).get('/api/errors/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Dependency not found');
    });
  });
});
