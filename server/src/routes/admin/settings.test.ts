import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

const defaultAdminUser = {
  id: 'user-1',
  email: 'admin@test.com',
  name: 'Admin User',
  role: 'admin',
  is_active: 1,
};

jest.mock('../../auth', () => ({
  requireAuth: jest.fn((req, _res, next) => {
    req.user = defaultAdminUser;
    next();
  }),
  requireAdmin: jest.fn((_req, _res, next) => next()),
}));

jest.mock('../../services/audit/AuditLogService', () => ({
  auditFromRequest: jest.fn(),
}));

import adminRouter from './index';
import { SettingsService } from '../../services/settings/SettingsService';

const app = express();
app.use(express.json());
// Simulate requireAuth at the mount level (as in index.ts: app.use('/api/admin', requireAuth, adminRouter))
app.use((req, _res, next) => {
  req.user = defaultAdminUser as never;
  next();
});
app.use('/api/admin', adminRouter);

describe('Admin Settings API', () => {
  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by TEXT,
        FOREIGN KEY (updated_by) REFERENCES users(id)
      );

      INSERT INTO users (id, email, name, role) VALUES
        ('user-1', 'admin@test.com', 'Admin User', 'admin');
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM settings');
    SettingsService.resetInstance();
  });

  describe('GET /api/admin/settings', () => {
    it('should return all settings with defaults', async () => {
      const response = await request(app).get('/api/admin/settings');

      expect(response.status).toBe(200);
      expect(response.body.settings).toBeDefined();
      expect(response.body.settings.data_retention_days).toEqual({
        value: 365,
        source: 'default',
      });
      expect(response.body.settings.global_rate_limit).toEqual({
        value: 100,
        source: 'default',
      });
    });

    it('should include all known settings keys', async () => {
      const response = await request(app).get('/api/admin/settings');

      const keys = Object.keys(response.body.settings);
      expect(keys).toContain('data_retention_days');
      expect(keys).toContain('retention_cleanup_time');
      expect(keys).toContain('default_poll_interval_ms');
      expect(keys).toContain('ssrf_allowlist');
      expect(keys).toContain('global_rate_limit');
      expect(keys).toContain('global_rate_limit_window_minutes');
      expect(keys).toContain('auth_rate_limit');
      expect(keys).toContain('auth_rate_limit_window_minutes');
      expect(keys).toContain('alert_cooldown_minutes');
      expect(keys).toContain('alert_rate_limit_per_hour');
    });

    it('should show database overrides', async () => {
      testDb.exec(`INSERT INTO settings (key, value, updated_by) VALUES ('data_retention_days', '90', 'user-1')`);

      const response = await request(app).get('/api/admin/settings');

      expect(response.body.settings.data_retention_days).toEqual({
        value: 90,
        source: 'database',
      });
    });
  });

  describe('PUT /api/admin/settings', () => {
    it('should update a single setting', async () => {
      const response = await request(app)
        .put('/api/admin/settings')
        .send({ data_retention_days: 90 });

      expect(response.status).toBe(200);
      expect(response.body.updated).toBe(1);
      expect(response.body.settings.data_retention_days).toEqual({
        value: 90,
        source: 'database',
      });
    });

    it('should update multiple settings', async () => {
      const response = await request(app)
        .put('/api/admin/settings')
        .send({
          data_retention_days: 180,
          global_rate_limit: 200,
          retention_cleanup_time: '03:00',
        });

      expect(response.status).toBe(200);
      expect(response.body.updated).toBe(3);
      expect(response.body.settings.data_retention_days.value).toBe(180);
      expect(response.body.settings.global_rate_limit.value).toBe(200);
      expect(response.body.settings.retention_cleanup_time.value).toBe('03:00');
    });

    it('should persist settings to database', async () => {
      await request(app)
        .put('/api/admin/settings')
        .send({ data_retention_days: 42 });

      const row = testDb.prepare('SELECT * FROM settings WHERE key = ?').get('data_retention_days') as { value: string };
      expect(row.value).toBe('42');
    });

    it('should report unknown keys without failing', async () => {
      const response = await request(app)
        .put('/api/admin/settings')
        .send({
          data_retention_days: 90,
          unknown_key: 'value',
        });

      expect(response.status).toBe(200);
      expect(response.body.updated).toBe(1);
      expect(response.body.unknownKeys).toEqual(['unknown_key']);
    });

    it('should return 400 when all keys are unknown', async () => {
      const response = await request(app)
        .put('/api/admin/settings')
        .send({ unknown_key: 'value' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No valid settings keys provided');
      expect(response.body.unknownKeys).toEqual(['unknown_key']);
    });

    it('should return 400 for invalid body types', async () => {
      const response = await request(app)
        .put('/api/admin/settings')
        .send('not json');

      expect(response.status).toBe(400);
    });

    it('should return 400 for array body', async () => {
      const response = await request(app)
        .put('/api/admin/settings')
        .send([{ key: 'value' }]);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Request body must be a JSON object of settings key-value pairs');
    });

    it('should return 400 for invalid setting values', async () => {
      const response = await request(app)
        .put('/api/admin/settings')
        .send({ data_retention_days: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('data_retention_days');
    });

    it('should return 400 for invalid retention_cleanup_time', async () => {
      const response = await request(app)
        .put('/api/admin/settings')
        .send({ retention_cleanup_time: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('retention_cleanup_time');
    });

    it('should return 400 for out-of-range poll interval', async () => {
      const response = await request(app)
        .put('/api/admin/settings')
        .send({ default_poll_interval_ms: 1000 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('default_poll_interval_ms');
    });
  });
});
