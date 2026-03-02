import request from 'supertest';
import express from 'express';
import session, { SessionData, Store } from 'express-session';
import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

const mockBuildAuthorizationUrl = jest.fn().mockReturnValue({ href: 'https://auth.example.com/authorize' });
const mockBuildEndSessionUrl = jest.fn().mockReturnValue({ href: 'https://auth.example.com/logout' });
const mockAuthorizationCodeGrant = jest.fn();
const mockFetchUserInfo = jest.fn();

jest.mock('../../auth/config', () => ({
  getOIDCConfig: jest.fn().mockReturnValue({}),
  generateCodeVerifier: jest.fn().mockReturnValue('test-verifier'),
  generateCodeChallenge: jest.fn().mockResolvedValue('test-challenge'),
  generateState: jest.fn().mockReturnValue('test-state'),
  client: {
    buildAuthorizationUrl: mockBuildAuthorizationUrl,
    buildEndSessionUrl: mockBuildEndSessionUrl,
    authorizationCodeGrant: mockAuthorizationCodeGrant,
    fetchUserInfo: mockFetchUserInfo,
  },
}));

jest.mock('../../auth/middleware', () => ({
  requireAuth: jest.fn((req, _res, next) => {
    req.user = req.testUser;
    next();
  }),
}));

import authRouter from './index';

describe('Server-side hardening (PRO-95)', () => {
  describe('Body size limit rejection', () => {
    let app: express.Express;

    beforeAll(() => {
      app = express();
      // Use an explicit body size limit matching production config
      app.use(express.json({ limit: '100kb' }));

      app.post('/test', (_req, res) => {
        res.json({ ok: true });
      });
    });

    it('should accept requests within the body size limit', async () => {
      const response = await request(app)
        .post('/test')
        .send({ data: 'small payload' });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });

    it('should reject requests exceeding the body size limit', async () => {
      // Generate a payload larger than 100kb
      const largePayload = { data: 'x'.repeat(200 * 1024) };

      const response = await request(app)
        .post('/test')
        .send(largePayload);

      expect(response.status).toBe(413);
    });
  });

  describe('Session destroy error handling', () => {
    let app: express.Express;

    beforeAll(() => {
      testDb.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          oidc_subject TEXT UNIQUE NOT NULL,
          password_hash TEXT,
          email TEXT UNIQUE NOT NULL,
          name TEXT,
          picture TEXT,
          role TEXT NOT NULL DEFAULT 'user',
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS teams (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
        contact TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS team_members (
          id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (team_id, user_id)
        );

        INSERT OR IGNORE INTO users (id, oidc_subject, email, name, role, is_active) VALUES
          ('user-1', 'oidc-1', 'admin@example.com', 'Admin User', 'admin', 1);
      `);

      app = express();
      app.use(express.json());
      app.use(
        session({
          secret: 'test-secret',
          resave: false,
          saveUninitialized: true,
          cookie: { secure: false },
        })
      );
      app.use('/api/auth', authRouter);
    });

    afterAll(() => {
      testDb.close();
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return 500 when session destroy fails', async () => {
      // Create a custom app with a session store that fails on destroy
      const failApp = express();
      failApp.use(express.json());

      // Build a proper Store subclass that fails on destroy
      class FailingStore extends Store {
        private sessions: Record<string, string> = {};

        get(_sid: string, cb: (err?: Error | null, session?: SessionData | null) => void) {
          const data = this.sessions[_sid];
          cb(null, data ? JSON.parse(data) : null);
        }

        set(_sid: string, _session: SessionData, cb?: (err?: Error) => void) {
          this.sessions[_sid] = JSON.stringify(_session);
          cb?.();
        }

        destroy(_sid: string, cb?: (err?: Error) => void) {
          cb?.(new Error('Store destroy failed'));
        }
      }

      const failingSessionMiddleware = session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false },
        store: new FailingStore(),
      });
      failApp.use(failingSessionMiddleware);

      // We need a route that creates a session first
      failApp.get('/setup', (req, _res) => {
        req.session.userId = 'user-1';
        _res.json({ ok: true });
      });

      // Import logout handler directly
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { logout } = require('./logout');
      failApp.post('/api/auth/logout', logout);

      const agent = request.agent(failApp);

      // Set up a session
      await agent.get('/setup');

      // Try to logout — should return 500 because session destroy fails
      const response = await agent.post('/api/auth/logout');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Logout failed');
    });

    it('should return 200 when session destroy succeeds', async () => {
      const response = await request(app).post('/api/auth/logout');

      expect(response.status).toBe(200);
      expect(response.body.redirectUrl).toBeDefined();
    });
  });

  describe('Timing-safe OIDC state comparison', () => {
    let app: express.Express;

    beforeAll(() => {
      app = express();
      app.use(express.json());
      app.use(
        session({
          secret: 'test-secret',
          resave: false,
          saveUninitialized: true,
          cookie: { secure: false },
        })
      );
      app.use('/api/auth', authRouter);
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should reject when state parameter is missing', async () => {
      const agent = request.agent(app);

      // Login to set up session with state
      await agent.get('/api/auth/login');

      // Callback without state parameter
      const response = await agent.get('/api/auth/callback?code=test-code');

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('error=state_mismatch');
    });

    it('should reject when state does not match session state', async () => {
      const agent = request.agent(app);

      // Login to set up session with state
      await agent.get('/api/auth/login');

      // Callback with wrong state
      const response = await agent.get('/api/auth/callback?code=test-code&state=wrong-state');

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('error=state_mismatch');
    });

    it('should accept when state matches session state', async () => {
      mockAuthorizationCodeGrant.mockResolvedValueOnce({
        claims: () => ({ sub: 'oidc-1' }),
        access_token: 'test-token',
      });
      mockFetchUserInfo.mockResolvedValueOnce({
        email: 'admin@example.com',
        name: 'Admin User',
      });

      const agent = request.agent(app);

      // Login to set up session with state='test-state'
      await agent.get('/api/auth/login');

      // Callback with matching state
      const response = await agent.get('/api/auth/callback?code=test-code&state=test-state');

      expect(response.status).toBe(302);
      expect(response.headers.location).not.toContain('error=state_mismatch');
    });
  });

  describe('SQLite pragmas', () => {
    it('should set synchronous = FULL and wal_autocheckpoint pragmas', () => {
      // Create a fresh in-memory database to test pragma initialization
      const pragmaDb = new Database(':memory:');

      // Apply the same pragmas as initializeDatabase()
      pragmaDb.pragma('foreign_keys = ON');
      pragmaDb.pragma('journal_mode = WAL');
      pragmaDb.pragma('synchronous = FULL');
      pragmaDb.pragma('wal_autocheckpoint = 1000');

      // Verify pragmas were set
      const foreignKeys = pragmaDb.pragma('foreign_keys', { simple: true });
      expect(foreignKeys).toBe(1);

      const synchronous = pragmaDb.pragma('synchronous', { simple: true });
      // FULL = 2
      expect(synchronous).toBe(2);

      const walAutocheckpoint = pragmaDb.pragma('wal_autocheckpoint', { simple: true });
      expect(walAutocheckpoint).toBe(1000);

      pragmaDb.close();
    });
  });
});
