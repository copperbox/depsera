import { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

// Create in-memory database for testing
const testDb = new Database(':memory:');

// Store original env values
const originalEnv = { ...process.env };

// Mock the db module
jest.mock('../db', () => ({
  db: testDb,
  default: testDb,
}));

import { initializeBypassMode, bypassAuthMiddleware } from './bypass';

describe('Auth Bypass', () => {
  beforeAll(() => {
    // Enable foreign keys
    testDb.pragma('foreign_keys = ON');

    // Create users table
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        oidc_subject TEXT UNIQUE,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    // Reset env
    process.env = { ...originalEnv };
    // Clear users table
    testDb.exec('DELETE FROM users');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('initializeBypassMode', () => {
    it('should throw error when AUTH_BYPASS=true in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.AUTH_BYPASS = 'true';

      expect(() => initializeBypassMode()).toThrow(
        'AUTH_BYPASS=true is not allowed in production'
      );
    });

    it('should log warning when AUTH_BYPASS=true in non-production', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS = 'true';

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      initializeBypassMode();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('WARNING'));
      warnSpy.mockRestore();
    });

    it('should not log warning when AUTH_BYPASS is not true', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS = 'false';

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      initializeBypassMode();

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should not throw in production when AUTH_BYPASS is not true', () => {
      process.env.NODE_ENV = 'production';
      process.env.AUTH_BYPASS = 'false';

      expect(() => initializeBypassMode()).not.toThrow();
    });
  });

  describe('bypassAuthMiddleware', () => {
    // Helper to create mock request
    const createMockRequest = (overrides: Partial<Request> = {}): Request => {
      return {
        session: {},
        user: undefined,
        ...overrides,
      } as Request;
    };

    // Helper to create mock response
    const createMockResponse = (): Response => {
      const res: Partial<Response> = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      return res as Response;
    };

    it('should call next immediately when AUTH_BYPASS is not true', () => {
      process.env.AUTH_BYPASS = 'false';

      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      bypassAuthMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('should load existing user from session when bypass is enabled', () => {
      process.env.AUTH_BYPASS = 'true';

      // Create a user in the database
      const userId = randomUUID();
      testDb.prepare(`
        INSERT INTO users (id, email, name, role, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, 'existing@example.com', 'Existing User', 'user', 1);

      const req = createMockRequest({
        session: { userId } as any,
      });
      const res = createMockResponse();
      const next = jest.fn();

      bypassAuthMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user?.id).toBe(userId);
    });

    it('should not set user when session user is inactive', () => {
      process.env.AUTH_BYPASS = 'true';

      // Create an inactive user in the database
      const userId = randomUUID();
      testDb.prepare(`
        INSERT INTO users (id, email, name, role, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, 'inactive@example.com', 'Inactive User', 'user', 0);

      const req = createMockRequest({
        session: { userId } as any,
      });
      const res = createMockResponse();
      const next = jest.fn();

      bypassAuthMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('should create dev user when no session and bypass enabled', () => {
      process.env.AUTH_BYPASS = 'true';
      // Note: DEV_USER is set at module load time with defaults, so we test with defaults

      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      const session: any = {};
      const req = createMockRequest({ session });
      const res = createMockResponse();
      const next = jest.fn();

      bypassAuthMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user?.email).toBe('dev@localhost');
      expect(req.user?.name).toBe('Development User');
      expect(req.user?.role).toBe('admin');
      expect(session.userId).toBe(req.user?.id);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('Created dev bypass user')
      );

      logSpy.mockRestore();
    });

    it('should reuse existing dev user when bypass enabled', () => {
      process.env.AUTH_BYPASS = 'true';

      // Note: The dev user may have been created by previous test or may not exist
      // First ensure it exists
      let existingUser = testDb.prepare(`
        SELECT id FROM users WHERE oidc_subject = ?
      `).get('dev-bypass-user') as { id: string } | undefined;

      if (!existingUser) {
        const devUserId = randomUUID();
        testDb.prepare(`
          INSERT INTO users (id, email, name, oidc_subject, role, is_active)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          devUserId,
          'dev@localhost',
          'Development User',
          'dev-bypass-user',
          'admin',
          1
        );
        existingUser = { id: devUserId };
      }

      const logSpy = jest.spyOn(console, 'log').mockImplementation();

      const session: any = {};
      const req = createMockRequest({ session });
      const res = createMockResponse();
      const next = jest.fn();

      bypassAuthMiddleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user?.id).toBe(existingUser.id);
      expect(session.userId).toBe(existingUser.id);
      // Should not log "Created" since user already exists
      expect(logSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Created dev bypass user')
      );

      logSpy.mockRestore();
    });
  });
});
