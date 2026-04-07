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

const mockAppSettingsGet = jest.fn();
const mockAppSettingsSet = jest.fn();

jest.mock('../../stores', () => ({
  getStores: () => ({
    appSettings: {
      get: mockAppSettingsGet,
      set: mockAppSettingsSet,
    },
  }),
}));

import adminRouter from './index';
import { auditFromRequest } from '../../services/audit/AuditLogService';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = defaultAdminUser as never;
  next();
});
app.use('/api/admin', adminRouter);

describe('Admin Span Retention API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppSettingsGet.mockReturnValue('7');
  });

  describe('GET /api/admin/settings/span-retention', () => {
    it('should return current span retention days', async () => {
      mockAppSettingsGet.mockReturnValue('14');

      const response = await request(app).get('/api/admin/settings/span-retention');

      expect(response.status).toBe(200);
      expect(response.body.days).toBe(14);
      expect(mockAppSettingsGet).toHaveBeenCalledWith('span_retention_days');
    });

    it('should return default 7 days when no setting exists', async () => {
      mockAppSettingsGet.mockReturnValue(undefined);

      const response = await request(app).get('/api/admin/settings/span-retention');

      expect(response.status).toBe(200);
      expect(response.body.days).toBe(7);
    });
  });

  describe('PUT /api/admin/settings/span-retention', () => {
    it('should update span retention days', async () => {
      const response = await request(app)
        .put('/api/admin/settings/span-retention')
        .send({ days: 14 });

      expect(response.status).toBe(200);
      expect(response.body.days).toBe(14);
      expect(mockAppSettingsSet).toHaveBeenCalledWith('span_retention_days', '14', 'user-1');
    });

    it('should audit the settings change', async () => {
      await request(app)
        .put('/api/admin/settings/span-retention')
        .send({ days: 30 });

      expect(auditFromRequest).toHaveBeenCalledWith(
        expect.anything(),
        'settings.updated',
        'settings',
        undefined,
        { key: 'span_retention_days', value: 30 },
      );
    });

    it('should return 400 for non-integer days', async () => {
      const response = await request(app)
        .put('/api/admin/settings/span-retention')
        .send({ days: 3.5 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('days must be an integer');
    });

    it('should return 400 for non-number days', async () => {
      const response = await request(app)
        .put('/api/admin/settings/span-retention')
        .send({ days: 'seven' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('days must be an integer');
    });

    it('should return 400 for days below minimum (1)', async () => {
      const response = await request(app)
        .put('/api/admin/settings/span-retention')
        .send({ days: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('between 1 and 365');
    });

    it('should return 400 for days above maximum (365)', async () => {
      const response = await request(app)
        .put('/api/admin/settings/span-retention')
        .send({ days: 400 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('between 1 and 365');
    });

    it('should accept minimum value (1)', async () => {
      const response = await request(app)
        .put('/api/admin/settings/span-retention')
        .send({ days: 1 });

      expect(response.status).toBe(200);
      expect(response.body.days).toBe(1);
    });

    it('should accept maximum value (365)', async () => {
      const response = await request(app)
        .put('/api/admin/settings/span-retention')
        .send({ days: 365 });

      expect(response.status).toBe(200);
      expect(response.body.days).toBe(365);
    });
  });
});
