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

import graphRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/graph', graphRouter);

describe('Graph API', () => {
  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        health_endpoint TEXT NOT NULL,
        metrics_endpoint TEXT,
        schema_config TEXT,
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_poll_success INTEGER,
        last_poll_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE dependencies (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        name TEXT NOT NULL,
        canonical_name TEXT,
        description TEXT,
        impact TEXT,
        type TEXT DEFAULT 'other',
        healthy INTEGER,
        health_state INTEGER,
        health_code INTEGER,
        latency_ms INTEGER,
        check_details TEXT,
        error TEXT,
        error_message TEXT,
        last_checked TEXT,
        last_status_change TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (service_id, name)
      );

      CREATE TABLE dependency_associations (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        linked_service_id TEXT NOT NULL,
        association_type TEXT DEFAULT 'api_call',
        is_auto_suggested INTEGER NOT NULL DEFAULT 0,
        confidence_score REAL,
        is_dismissed INTEGER NOT NULL DEFAULT 0,
        match_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (dependency_id, linked_service_id)
      );

      CREATE TABLE dependency_latency_history (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        recorded_at TEXT NOT NULL
      );

      INSERT INTO teams (id, name) VALUES ('team-1', 'Test Team');

      INSERT INTO services (id, name, team_id, health_endpoint) VALUES
        ('svc-1', 'User Service', 'team-1', 'http://user/health'),
        ('svc-2', 'Order Service', 'team-1', 'http://order/health');

      INSERT INTO dependencies (id, service_id, name, type, healthy) VALUES
        ('dep-1', 'svc-1', 'Order API', 'rest', 1);

      INSERT INTO dependency_associations (id, dependency_id, linked_service_id)
      VALUES ('assoc-1', 'dep-1', 'svc-2');
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/graph', () => {
    it('should return full graph', async () => {
      const response = await request(app).get('/api/graph');

      expect(response.status).toBe(200);
      expect(response.body.nodes).toBeDefined();
      expect(response.body.edges).toBeDefined();
      expect(Array.isArray(response.body.nodes)).toBe(true);
      expect(Array.isArray(response.body.edges)).toBe(true);
    });

    it('should filter by team', async () => {
      const response = await request(app).get('/api/graph?team=team-1');

      expect(response.status).toBe(200);
      expect(response.body.nodes.length).toBeGreaterThan(0);
    });

    it('should filter by service', async () => {
      const response = await request(app).get('/api/graph?service=svc-1');

      expect(response.status).toBe(200);
      expect(response.body.nodes.length).toBeGreaterThan(0);
    });

    it('should filter by dependency', async () => {
      const response = await request(app).get('/api/graph?dependency=dep-1');

      expect(response.status).toBe(200);
      expect(response.body.nodes.length).toBeGreaterThan(0);
    });

    it('should return empty graph for non-existent team', async () => {
      const response = await request(app).get('/api/graph?team=non-existent');

      expect(response.status).toBe(200);
      expect(response.body.nodes).toHaveLength(0);
    });

    it('should return empty graph for non-existent dependency', async () => {
      const response = await request(app).get('/api/graph?dependency=non-existent');

      expect(response.status).toBe(200);
      expect(response.body.nodes).toHaveLength(0);
    });
  });
});
