import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

// Create in-memory database for testing
const testDb = new Database(':memory:');

// Mock the db module to return our test database
jest.mock('../../../db', () => ({
  __esModule: true,
  default: testDb,
  db: testDb,
}));

// Mock auth — admin passes through by default
jest.mock('../../../auth', () => ({
  requireAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

// Reset singleton so it picks up our test db
import { StoreRegistry } from '../../../stores';
StoreRegistry.resetInstance();

import aliasesRouter from '../index';

const app = express();
app.use(express.json());
app.use('/api/aliases', aliasesRouter);

describe('Aliases API', () => {
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

  describe('GET /api/aliases', () => {
    it('returns empty array when no aliases', async () => {
      const res = await request(app).get('/api/aliases');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all aliases', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('1', 'pg-main', 'Primary DB')"
      ).run();

      const res = await request(app).get('/api/aliases');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].alias).toBe('pg-main');
      expect(res.body[0].canonical_name).toBe('Primary DB');
    });
  });

  describe('POST /api/aliases', () => {
    it('creates an alias', async () => {
      const res = await request(app)
        .post('/api/aliases')
        .send({ alias: 'pg-main', canonical_name: 'Primary DB' });

      expect(res.status).toBe(201);
      expect(res.body.alias).toBe('pg-main');
      expect(res.body.canonical_name).toBe('Primary DB');
      expect(res.body.id).toBeDefined();
    });

    it('returns 400 when alias is missing', async () => {
      const res = await request(app)
        .post('/api/aliases')
        .send({ canonical_name: 'Primary DB' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when canonical_name is missing', async () => {
      const res = await request(app)
        .post('/api/aliases')
        .send({ alias: 'pg-main' });

      expect(res.status).toBe(400);
    });

    it('returns 409 when alias already exists', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('1', 'pg-main', 'Primary DB')"
      ).run();

      const res = await request(app)
        .post('/api/aliases')
        .send({ alias: 'pg-main', canonical_name: 'Other DB' });

      expect(res.status).toBe(409);
    });

    it('trims whitespace from inputs', async () => {
      const res = await request(app)
        .post('/api/aliases')
        .send({ alias: '  pg-main  ', canonical_name: '  Primary DB  ' });

      expect(res.status).toBe(201);
      expect(res.body.alias).toBe('pg-main');
      expect(res.body.canonical_name).toBe('Primary DB');
    });
  });

  describe('PUT /api/aliases/:id', () => {
    it('updates canonical name', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('1', 'pg-main', 'Primary DB')"
      ).run();

      const res = await request(app)
        .put('/api/aliases/1')
        .send({ canonical_name: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body.canonical_name).toBe('New Name');
    });

    it('returns 404 for nonexistent alias', async () => {
      const res = await request(app)
        .put('/api/aliases/nonexistent')
        .send({ canonical_name: 'New Name' });

      expect(res.status).toBe(404);
    });

    it('returns 400 when canonical_name is missing', async () => {
      const res = await request(app)
        .put('/api/aliases/1')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/aliases/:id', () => {
    it('deletes an alias', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('1', 'pg-main', 'Primary DB')"
      ).run();

      const res = await request(app).delete('/api/aliases/1');
      expect(res.status).toBe(204);

      const check = testDb.prepare('SELECT * FROM dependency_aliases WHERE id = ?').get('1');
      expect(check).toBeUndefined();
    });

    it('returns 404 for nonexistent alias', async () => {
      const res = await request(app).delete('/api/aliases/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/aliases/canonical-names', () => {
    it('returns distinct canonical names', async () => {
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('1', 'pg-main', 'Primary DB')"
      ).run();
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('2', 'postgres', 'Primary DB')"
      ).run();
      testDb.prepare(
        "INSERT INTO dependency_aliases (id, alias, canonical_name) VALUES ('3', 'redis-1', 'Cache')"
      ).run();

      const res = await request(app).get('/api/aliases/canonical-names');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(['Cache', 'Primary DB']);
    });
  });
});
