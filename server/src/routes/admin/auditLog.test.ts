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
  requireAdmin: jest.fn((_req, _res, next) => next()),
}));

import adminRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

describe('Admin Audit Log API', () => {
  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      INSERT INTO users (id, email, name, role) VALUES
        ('user-1', 'admin@test.com', 'Admin User', 'admin');

      INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
      VALUES
        ('log-1', 'user-1', 'user.role_changed', 'user', 'user-2', '{"previousRole":"user","newRole":"admin"}', '127.0.0.1', '2026-01-01T00:00:00Z'),
        ('log-2', 'user-1', 'team.created', 'team', 'team-1', '{"name":"Alpha"}', '127.0.0.1', '2026-01-02T00:00:00Z'),
        ('log-3', 'user-1', 'service.created', 'service', 'svc-1', '{"name":"API"}', '127.0.0.1', '2026-01-03T00:00:00Z'),
        ('log-4', 'user-1', 'service.deleted', 'service', 'svc-2', '{"name":"Old API"}', '127.0.0.1', '2026-01-04T00:00:00Z'),
        ('log-5', 'user-1', 'team.member_added', 'team', 'team-1', '{"memberId":"user-3"}', '127.0.0.1', '2026-01-05T00:00:00Z');
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/admin/audit-log', () => {
    it('should return paginated audit log entries', async () => {
      const response = await request(app).get('/api/admin/audit-log');

      expect(response.status).toBe(200);
      expect(response.body.entries).toHaveLength(5);
      expect(response.body.total).toBe(5);
      expect(response.body.limit).toBe(50);
      expect(response.body.offset).toBe(0);
    });

    it('should include user details in entries', async () => {
      const response = await request(app).get('/api/admin/audit-log');

      expect(response.body.entries[0].user_email).toBe('admin@test.com');
      expect(response.body.entries[0].user_name).toBe('Admin User');
    });

    it('should return entries ordered by created_at DESC', async () => {
      const response = await request(app).get('/api/admin/audit-log');

      const entries = response.body.entries;
      expect(entries[0].id).toBe('log-5');
      expect(entries[4].id).toBe('log-1');
    });

    it('should respect limit parameter', async () => {
      const response = await request(app).get('/api/admin/audit-log?limit=2');

      expect(response.body.entries).toHaveLength(2);
      expect(response.body.limit).toBe(2);
      expect(response.body.total).toBe(5);
    });

    it('should respect offset parameter', async () => {
      const response = await request(app).get('/api/admin/audit-log?limit=2&offset=3');

      expect(response.body.entries).toHaveLength(2);
      expect(response.body.offset).toBe(3);
    });

    it('should cap limit at 250', async () => {
      const response = await request(app).get('/api/admin/audit-log?limit=500');

      expect(response.body.limit).toBe(250);
    });

    it('should filter by startDate', async () => {
      const response = await request(app).get('/api/admin/audit-log?startDate=2026-01-03T00:00:00Z');

      expect(response.body.entries).toHaveLength(3);
      expect(response.body.total).toBe(3);
    });

    it('should filter by endDate', async () => {
      const response = await request(app).get('/api/admin/audit-log?endDate=2026-01-02T00:00:00Z');

      expect(response.body.entries).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });

    it('should filter by action', async () => {
      const response = await request(app).get('/api/admin/audit-log?action=team.created');

      expect(response.body.entries).toHaveLength(1);
      expect(response.body.entries[0].action).toBe('team.created');
    });

    it('should filter by resourceType', async () => {
      const response = await request(app).get('/api/admin/audit-log?resourceType=service');

      expect(response.body.entries).toHaveLength(2);
    });

    it('should filter by userId', async () => {
      const response = await request(app).get('/api/admin/audit-log?userId=user-1');

      expect(response.body.entries).toHaveLength(5);
    });

    it('should combine multiple filters', async () => {
      const response = await request(app).get(
        '/api/admin/audit-log?resourceType=service&startDate=2026-01-04T00:00:00Z'
      );

      expect(response.body.entries).toHaveLength(1);
      expect(response.body.entries[0].action).toBe('service.deleted');
    });
  });
});
