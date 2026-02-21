import { logAuditEvent, auditFromRequest } from './AuditLogService';

// Mock stores
const mockCreate = jest.fn();
jest.mock('../../stores', () => ({
  getStores: () => ({
    auditLog: { create: mockCreate },
  }),
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

import logger from '../../utils/logger';

describe('AuditLogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logAuditEvent', () => {
    it('should create an audit log entry', () => {
      logAuditEvent({
        userId: 'user-1',
        action: 'user.role_changed',
        resourceType: 'user',
        resourceId: 'user-2',
        details: { previousRole: 'user', newRole: 'admin' },
        ipAddress: '127.0.0.1',
      });

      expect(mockCreate).toHaveBeenCalledWith({
        user_id: 'user-1',
        action: 'user.role_changed',
        resource_type: 'user',
        resource_id: 'user-2',
        details: JSON.stringify({ previousRole: 'user', newRole: 'admin' }),
        ip_address: '127.0.0.1',
      });
    });

    it('should handle null optional fields', () => {
      logAuditEvent({
        userId: 'user-1',
        action: 'team.created',
        resourceType: 'team',
      });

      expect(mockCreate).toHaveBeenCalledWith({
        user_id: 'user-1',
        action: 'team.created',
        resource_type: 'team',
        resource_id: null,
        details: null,
        ip_address: null,
      });
    });

    it('should not throw on store errors (fire-and-forget)', () => {
      mockCreate.mockImplementation(() => {
        throw new Error('DB write failed');
      });

      expect(() => {
        logAuditEvent({
          userId: 'user-1',
          action: 'team.created',
          resourceType: 'team',
        });
      }).not.toThrow();

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('auditFromRequest', () => {
    it('should extract user ID from req.user', () => {
      const req = {
        user: { id: 'user-1' },
        ip: '192.168.1.1',
        headers: {},
      } as unknown as import('express').Request;

      auditFromRequest(req, 'service.created', 'service', 'svc-1', { name: 'API' });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          action: 'service.created',
          resource_type: 'service',
          resource_id: 'svc-1',
          ip_address: '192.168.1.1',
        }),
      );
    });

    it('should fall back to x-user-id header', () => {
      const req = {
        headers: { 'x-user-id': 'user-2' },
        ip: '10.0.0.1',
      } as unknown as import('express').Request;

      auditFromRequest(req, 'team.deleted', 'team', 'team-1');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-2',
        }),
      );
    });

    it('should skip if no user ID available', () => {
      const req = {
        headers: {},
      } as unknown as import('express').Request;

      auditFromRequest(req, 'team.created', 'team');

      expect(mockCreate).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
