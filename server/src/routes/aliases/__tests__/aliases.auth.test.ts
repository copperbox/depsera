import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../../../db', () => ({
  __esModule: true,
  default: testDb,
  db: testDb,
}));

// Mock auth — requireAdmin rejects with 403 (simulates non-admin user)
jest.mock('../../../auth', () => ({
  requireAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: jest.fn((_req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    res.status(403).json({ error: 'Forbidden: admin access required' });
  }),
}));

import { StoreRegistry } from '../../../stores';
StoreRegistry.resetInstance();

import aliasesRouter from '../index';

const app = express();
app.use(express.json());
app.use('/api/aliases', aliasesRouter);

describe('Aliases API — non-admin authorization', () => {
  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS dependency_aliases (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        canonical_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM dependency_aliases');
  });

  afterAll(() => {
    testDb.close();
  });

  describe('read endpoints remain accessible to non-admin users', () => {
    it('GET /api/aliases returns 200', async () => {
      const res = await request(app).get('/api/aliases');
      expect(res.status).toBe(200);
    });

    it('GET /api/aliases/canonical-names returns 200', async () => {
      const res = await request(app).get('/api/aliases/canonical-names');
      expect(res.status).toBe(200);
    });
  });

  describe('mutation endpoints reject non-admin users with 403', () => {
    it('POST /api/aliases returns 403 for non-admin', async () => {
      const res = await request(app)
        .post('/api/aliases')
        .send({ alias: 'pg-main', canonical_name: 'Primary DB' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/admin/i);
    });

    it('PUT /api/aliases/:id returns 403 for non-admin', async () => {
      const res = await request(app)
        .put('/api/aliases/some-id')
        .send({ canonical_name: 'New Name' });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/admin/i);
    });

    it('DELETE /api/aliases/:id returns 403 for non-admin', async () => {
      const res = await request(app).delete('/api/aliases/some-id');

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/admin/i);
    });

    it('POST /api/aliases does not create data when non-admin', async () => {
      await request(app)
        .post('/api/aliases')
        .send({ alias: 'pg-main', canonical_name: 'Primary DB' });

      const count = testDb.prepare('SELECT COUNT(*) as count FROM dependency_aliases').get() as { count: number };
      expect(count.count).toBe(0);
    });
  });
});
