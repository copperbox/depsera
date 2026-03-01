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

import { Router } from 'express';
import { getServicePollHistory } from './pollHistory';

const app = express();
app.use(express.json());

const router = Router();
router.get('/:id/poll-history', getServicePollHistory);
app.use('/api/services', router);

describe('Poll History Route', () => {
  const testServiceId = 'svc-1';

  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        key TEXT,
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

      CREATE TABLE service_poll_history (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        error TEXT,
        recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO teams (id, name) VALUES ('team-1', 'Test Team');
      INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES ('${testServiceId}', 'Test Service', 'team-1', 'http://test/health');

      INSERT INTO service_poll_history (id, service_id, error, recorded_at)
      VALUES
        ('ph-1', '${testServiceId}', 'Connection refused', datetime('now')),
        ('ph-2', '${testServiceId}', null, datetime('now')),
        ('ph-3', '${testServiceId}', 'Timeout', datetime('now'));
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/services/:id/poll-history', () => {
    it('should return 200 with correct shape', async () => {
      const response = await request(app).get(`/api/services/${testServiceId}/poll-history`);

      expect(response.status).toBe(200);
      expect(response.body.serviceId).toBe(testServiceId);
      expect(typeof response.body.errorCount).toBe('number');
      expect(Array.isArray(response.body.entries)).toBe(true);
    });

    it('should format entries with error, recordedAt, and isRecovery fields', async () => {
      const response = await request(app).get(`/api/services/${testServiceId}/poll-history`);

      const entries = response.body.entries;
      expect(entries.length).toBeGreaterThan(0);

      // Each entry should have the expected shape
      for (const entry of entries) {
        expect(entry).toHaveProperty('error');
        expect(entry).toHaveProperty('recordedAt');
        expect(entry).toHaveProperty('isRecovery');
      }
    });

    it('should mark recovery entries correctly', async () => {
      const response = await request(app).get(`/api/services/${testServiceId}/poll-history`);

      const entries = response.body.entries;
      const recoveries = entries.filter((e: { isRecovery: boolean }) => e.isRecovery);
      const errors = entries.filter((e: { isRecovery: boolean }) => !e.isRecovery);

      // We inserted one null-error entry (ph-2) which is a recovery
      expect(recoveries.length).toBeGreaterThanOrEqual(1);
      expect(errors.length).toBeGreaterThanOrEqual(1);

      // Recovery entries should have null error
      for (const r of recoveries) {
        expect(r.error).toBeNull();
      }
    });

    it('should count errors in last 24h', async () => {
      const response = await request(app).get(`/api/services/${testServiceId}/poll-history`);

      // We inserted 2 error entries (ph-1, ph-3) with datetime('now') timestamps
      expect(response.body.errorCount).toBe(2);
    });

    it('should return 404 for non-existent service', async () => {
      const response = await request(app).get('/api/services/non-existent/poll-history');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Service not found');
    });

    it('should return empty entries when no history', async () => {
      // Insert a service with no poll history
      testDb.exec(`
        INSERT INTO services (id, name, team_id, health_endpoint)
        VALUES ('svc-empty', 'Empty Service', 'team-1', 'http://empty/health');
      `);

      const response = await request(app).get('/api/services/svc-empty/poll-history');

      expect(response.status).toBe(200);
      expect(response.body.serviceId).toBe('svc-empty');
      expect(response.body.errorCount).toBe(0);
      expect(response.body.entries).toEqual([]);
    });
  });
});
