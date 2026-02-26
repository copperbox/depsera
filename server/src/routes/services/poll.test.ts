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
  requireServiceTeamLead: jest.fn((_req, _res, next) => next()),
}));

const mockPollNow = jest.fn();

jest.mock('../../services/polling', () => ({
  HealthPollingService: {
    getInstance: jest.fn().mockReturnValue({
      pollNow: mockPollNow,
    }),
  },
}));

import { Router } from 'express';
import { pollServiceNow } from './poll';

const app = express();
app.use(express.json());

const router = Router();
router.post('/:id/poll', pollServiceNow);
app.use('/api/services', router);

describe('Poll Route', () => {
  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
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
        is_external INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        last_poll_success INTEGER,
        last_poll_error TEXT,
        poll_warnings TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO teams (id, name) VALUES ('team-1', 'Test Team');
      INSERT INTO services (id, name, team_id, health_endpoint, is_active) VALUES
        ('svc-1', 'Active Service', 'team-1', 'http://active/health', 1),
        ('svc-2', 'Inactive Service', 'team-1', 'http://inactive/health', 0);
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/services/:id/poll', () => {
    it('should poll service successfully', async () => {
      mockPollNow.mockResolvedValueOnce({
        success: true,
        dependenciesUpdated: 5,
        statusChanges: [],
        latencyMs: 150,
      });

      const response = await request(app).post('/api/services/svc-1/poll');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.dependencies_updated).toBe(5);
      expect(response.body.status_changes).toBe(0);
      expect(response.body.latency_ms).toBe(150);
    });

    it('should return poll failure result', async () => {
      mockPollNow.mockResolvedValueOnce({
        success: false,
        dependenciesUpdated: 0,
        statusChanges: [],
        latencyMs: 50,
        error: 'Connection refused',
      });

      const response = await request(app).post('/api/services/svc-1/poll');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Connection refused');
    });

    it('should return 404 for non-existent service', async () => {
      const response = await request(app).post('/api/services/non-existent/poll');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Service not found');
    });

    it('should return 400 for inactive service', async () => {
      const response = await request(app).post('/api/services/svc-2/poll');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Service is not active');
    });

    it('should handle polling errors', async () => {
      mockPollNow.mockRejectedValueOnce(new Error('Polling failed'));

      const response = await request(app).post('/api/services/svc-1/poll');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Internal server error');
      expect(response.body.message).toBeUndefined();
    });

    it('should count status changes', async () => {
      mockPollNow.mockResolvedValueOnce({
        success: true,
        dependenciesUpdated: 3,
        statusChanges: [
          { dependencyName: 'Dep1' },
          { dependencyName: 'Dep2' },
        ],
        latencyMs: 100,
      });

      const response = await request(app).post('/api/services/svc-1/poll');

      expect(response.body.status_changes).toBe(2);
    });
  });
});
