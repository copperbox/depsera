import Database from 'better-sqlite3';

const testDb = new Database(':memory:');
const originalEnv = { ...process.env };

jest.mock('../db', () => ({
  db: testDb,
  default: testDb,
}));

jest.mock('../utils/logger', () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  },
  __esModule: true,
}));

import {
  getAuthMode,
  hashPassword,
  verifyPassword,
  validateLocalAuthConfig,
  bootstrapLocalAdmin,
} from './localAuth';
import logger from '../utils/logger';

describe('localAuth', () => {
  beforeAll(() => {
    testDb.pragma('foreign_keys = ON');
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        oidc_subject TEXT UNIQUE,
        password_hash TEXT,
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
    process.env = { ...originalEnv };
    testDb.exec('DELETE FROM users');
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('getAuthMode', () => {
    it('should return "local" when LOCAL_AUTH=true', () => {
      process.env.LOCAL_AUTH = 'true';
      expect(getAuthMode()).toBe('local');
    });

    it('should return "oidc" by default', () => {
      delete process.env.LOCAL_AUTH;
      expect(getAuthMode()).toBe('oidc');
    });
  });

  describe('hashPassword / verifyPassword', () => {
    it('should hash and verify a password', () => {
      const hash = hashPassword('mypassword123');
      expect(hash).toBeDefined();
      expect(hash).not.toBe('mypassword123');
      expect(verifyPassword('mypassword123', hash)).toBe(true);
    });

    it('should reject an incorrect password', () => {
      const hash = hashPassword('correctpassword');
      expect(verifyPassword('wrongpassword', hash)).toBe(false);
    });

    it('should produce different hashes for same password', () => {
      const hash1 = hashPassword('samepassword');
      const hash2 = hashPassword('samepassword');
      expect(hash1).not.toBe(hash2);
      // Both should still verify
      expect(verifyPassword('samepassword', hash1)).toBe(true);
      expect(verifyPassword('samepassword', hash2)).toBe(true);
    });
  });

  describe('validateLocalAuthConfig', () => {
    it('should do nothing when LOCAL_AUTH is not true', () => {
      delete process.env.LOCAL_AUTH;
      expect(() => validateLocalAuthConfig()).not.toThrow();
    });

    it('should warn when OIDC vars are present with LOCAL_AUTH', () => {
      process.env.LOCAL_AUTH = 'true';
      process.env.OIDC_ISSUER_URL = 'https://idp.example.com';
      process.env.OIDC_CLIENT_ID = 'my-client';

      validateLocalAuthConfig();

      expect(logger.warn).toHaveBeenCalledWith(
        'LOCAL_AUTH=true — OIDC configuration will be ignored',
      );
    });

    it('should not warn when no OIDC vars present', () => {
      process.env.LOCAL_AUTH = 'true';
      delete process.env.OIDC_ISSUER_URL;
      delete process.env.OIDC_CLIENT_ID;

      validateLocalAuthConfig();

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('bootstrapLocalAdmin', () => {
    it('should do nothing when LOCAL_AUTH is not true', () => {
      delete process.env.LOCAL_AUTH;
      bootstrapLocalAdmin();
      const count = (testDb.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
      expect(count).toBe(0);
    });

    it('should create admin user on first startup', () => {
      process.env.LOCAL_AUTH = 'true';
      process.env.ADMIN_EMAIL = 'admin@test.com';
      process.env.ADMIN_PASSWORD = 'securepassword';

      bootstrapLocalAdmin();

      const user = testDb.prepare('SELECT * FROM users WHERE email = ?').get('admin@test.com') as unknown as Record<string, unknown>;
      expect(user).toBeDefined();
      expect(user.role).toBe('admin');
      expect(user.password_hash).toBeDefined();
      expect(user.password_hash).not.toBe('securepassword');
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'admin@test.com' }),
        'local auth: initial admin user created',
      );
    });

    it('should skip if users already exist', () => {
      process.env.LOCAL_AUTH = 'true';
      process.env.ADMIN_EMAIL = 'admin@test.com';
      process.env.ADMIN_PASSWORD = 'securepassword';

      // Insert an existing user
      testDb.prepare(`
        INSERT INTO users (id, email, name, role, is_active)
        VALUES ('existing', 'existing@test.com', 'Existing', 'user', 1)
      `).run();

      bootstrapLocalAdmin();

      const count = (testDb.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
      expect(count).toBe(1); // Still just the one user
      expect(logger.debug).toHaveBeenCalledWith(
        'local auth: users already exist, skipping admin bootstrap',
      );
    });

    it('should throw if ADMIN_EMAIL is missing', () => {
      process.env.LOCAL_AUTH = 'true';
      delete process.env.ADMIN_EMAIL;
      process.env.ADMIN_PASSWORD = 'securepassword';

      expect(() => bootstrapLocalAdmin()).toThrow(
        'LOCAL_AUTH=true requires ADMIN_EMAIL and ADMIN_PASSWORD',
      );
    });

    it('should throw if ADMIN_PASSWORD is missing', () => {
      process.env.LOCAL_AUTH = 'true';
      process.env.ADMIN_EMAIL = 'admin@test.com';
      delete process.env.ADMIN_PASSWORD;

      expect(() => bootstrapLocalAdmin()).toThrow(
        'LOCAL_AUTH=true requires ADMIN_EMAIL and ADMIN_PASSWORD',
      );
    });

    it('should throw if ADMIN_PASSWORD is too short', () => {
      process.env.LOCAL_AUTH = 'true';
      process.env.ADMIN_EMAIL = 'admin@test.com';
      process.env.ADMIN_PASSWORD = 'short';

      expect(() => bootstrapLocalAdmin()).toThrow(
        'ADMIN_PASSWORD must be at least 8 characters',
      );
    });

    it('should derive name from email', () => {
      process.env.LOCAL_AUTH = 'true';
      process.env.ADMIN_EMAIL = 'john.doe@example.com';
      process.env.ADMIN_PASSWORD = 'securepassword';

      bootstrapLocalAdmin();

      const user = testDb.prepare('SELECT * FROM users WHERE email = ?').get('john.doe@example.com') as unknown as Record<string, unknown>;
      expect(user.name).toBe('john.doe');
    });
  });
});
